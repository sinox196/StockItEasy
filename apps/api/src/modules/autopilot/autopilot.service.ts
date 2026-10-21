import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  allocateBudget,
  computeReplenishment,
  d,
  decideRecommendationSchema,
  forecastDemand,
  ForecastResult,
} from '@stockiteasy/shared';
import { z } from 'zod';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import { TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { PurchasingService } from '../purchasing/purchasing.service';

const HISTORY_DAYS = 90;
const DEFAULT_LEAD_TIME = 7;
const STALE_AFTER_MS = 6 * 3600_000;

/**
 * Stock Autopilot v1: statistical forecasts + explicit business rules.
 * Every recommendation stores its reasons and assumptions; nothing is ordered
 * until a user approves, which creates a DRAFT purchase order for review.
 */
@Injectable()
export class AutopilotService {
  private readonly logger = new Logger('Autopilot');

  constructor(
    private readonly prisma: PrismaService,
    private readonly purchasing: PurchasingService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Daily net demand (sales − returns) per (product, warehouse), one value per
   * completed local day (Africa/Tunis), oldest first. The series starts at the
   * product's first movement in that warehouse: a short history is never padded
   * with invented zero days.
   */
  private async demandSeries(organizationId: string, now: Date) {
    const since = new Date(now.getTime() - (HISTORY_DAYS + 1) * 86400_000);
    const rows = await this.prisma.$queryRaw<{ productId: string; warehouseId: string; day: string; qty: string }[]>`
      SELECT "productId", "warehouseId", to_char(("occurredAt" AT TIME ZONE 'Africa/Tunis')::date, 'YYYY-MM-DD') AS day,
             SUM(-quantity)::text AS qty
      FROM inventory_movements
      WHERE "organizationId" = ${organizationId}::uuid AND "occurredAt" >= ${since}
        AND type IN ('SALE', 'SALE_REVERSAL', 'CUSTOMER_RETURN')
      GROUP BY 1, 2, 3`;
    const firsts = await this.prisma.$queryRaw<{ productId: string; warehouseId: string; first: Date }[]>`
      SELECT "productId", "warehouseId", MIN("occurredAt") AS first FROM inventory_movements
      WHERE "organizationId" = ${organizationId}::uuid GROUP BY 1, 2`;
    // End-of-day on-hand per product/warehouse, to recognise days the shelf was empty.
    const closings = await this.prisma.$queryRaw<{ productId: string; warehouseId: string; day: string; balance: string }[]>`
      SELECT DISTINCT ON ("productId", "warehouseId", day) "productId", "warehouseId", day, balance FROM (
        SELECT "productId", "warehouseId", to_char(("occurredAt" AT TIME ZONE 'Africa/Tunis')::date, 'YYYY-MM-DD') AS day,
               "balanceAfter"::text AS balance, "occurredAt", "createdAt"
        FROM inventory_movements WHERE "organizationId" = ${organizationId}::uuid AND "occurredAt" >= ${since}
      ) x ORDER BY "productId", "warehouseId", day, "occurredAt" DESC, "createdAt" DESC`;
    const firstMap = new Map(firsts.map((f) => [`${f.productId}:${f.warehouseId}`, f.first]));
    const byKey = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const key = `${r.productId}:${r.warehouseId}`;
      if (!byKey.has(key)) byKey.set(key, new Map());
      byKey.get(key)!.set(r.day, Math.max(0, Number(r.qty)));
    }
    const closingByKey = new Map<string, Map<string, number>>();
    for (const c of closings) {
      const key = `${c.productId}:${c.warehouseId}`;
      if (!closingByKey.has(key)) closingByKey.set(key, new Map());
      closingByKey.get(key)!.set(c.day, Number(c.balance));
    }
    const localDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(date);
    const today = localDay(now);
    return (productId: string, warehouseId: string): { series: number[]; excludedStockoutDays: number } => {
      const key = `${productId}:${warehouseId}`;
      const first = firstMap.get(key);
      if (!first) return { series: [], excludedStockoutDays: 0 };
      const m = byKey.get(key) ?? new Map<string, number>();
      const closing = closingByKey.get(key) ?? new Map<string, number>();
      const startDay = localDay(new Date(Math.max(first.getTime(), now.getTime() - HISTORY_DAYS * 86400_000)));
      const series: number[] = [];
      let excludedStockoutDays = 0;
      let lastClosing: number | null = null;
      // Walk calendar days from startDay up to yesterday (today is incomplete).
      for (let t = Date.parse(`${startDay}T12:00:00Z`); ; t += 86400_000) {
        const day = new Date(t).toISOString().slice(0, 10);
        if (day >= today) break;
        const sold = m.get(day) ?? 0;
        // A day that starts with an empty shelf and sells nothing says nothing about demand
        // (censored demand): it is left out instead of being counted as zero sales.
        if (lastClosing !== null && lastClosing <= 0 && sold === 0) excludedStockoutDays++;
        else series.push(sold);
        if (closing.has(day)) lastClosing = closing.get(day)!;
      }
      return { series, excludedStockoutDays };
    };
  }

  /** Optional advanced forecast from the Python service; falls back to the local statistical model. */
  private async forecast(series: number[]): Promise<ForecastResult> {
    const url = env().AI_SERVICE_URL;
    if (url && series.length >= 28) {
      try {
        const res = await fetch(`${url}/forecast`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ series }),
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) return (await res.json()) as ForecastResult;
      } catch (e) {
        this.logger.warn(`AI service unavailable, using local forecast: ${String(e)}`);
      }
    }
    return forecastDemand(series);
  }

  async run(organizationId: string, now = new Date()) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const products = await this.prisma.product.findMany({
      where: { organizationId, status: 'ACTIVE' },
      include: { supplierProducts: { include: { supplier: true } }, preferredSupplier: true, balances: true },
    });
    const warehouses = await this.prisma.warehouse.findMany({ where: { organizationId, isActive: true } });
    const openLines = await this.prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { organizationId, status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'PENDING_APPROVAL'] } } },
      include: { purchaseOrder: { select: { warehouseId: true } } },
    });
    const onOrder = new Map<string, number>();
    for (const l of openLines) {
      const key = `${l.productId}:${l.purchaseOrder.warehouseId}`;
      onOrder.set(key, (onOrder.get(key) ?? 0) + Number(l.quantity.minus(l.quantityReceived)));
    }
    const series = await this.demandSeries(organizationId, now);

    const created: Prisma.ReplenishmentRecommendationCreateManyInput[] = [];
    for (const p of products) {
      const sp = p.supplierProducts.find((s) => s.isPreferred) ?? p.supplierProducts.find((s) => s.supplierId === p.preferredSupplierId) ?? p.supplierProducts[0];
      const supplier = sp?.supplier ?? p.preferredSupplier ?? null;
      const leadTime = sp?.leadTimeDays ?? supplier?.leadTimeDays ?? DEFAULT_LEAD_TIME;
      const unitCost = sp?.unitPrice?.toString() ?? (p.averageCost.gt(0) ? p.averageCost.toString() : p.purchasePrice.toString());
      for (const w of warehouses) {
        const balance = p.balances.find((b) => b.warehouseId === w.id);
        // Only warehouses that stock the product (or the single warehouse of a small shop).
        if (!balance && (warehouses.length > 1 || p.minStock.lte(0))) continue;
        const available = balance ? Number(balance.quantityOnHand.minus(balance.quantityReserved).minus(balance.quantityBlocked)) : 0;
        const { series: history, excludedStockoutDays } = series(p.id, w.id);
        const f = await this.forecast(history);
        const r = computeReplenishment({
          available,
          onOrder: onOrder.get(`${p.id}:${w.id}`) ?? 0,
          minStock: Number(p.minStock),
          maxStock: p.maxStock ? Number(p.maxStock) : null,
          leadTimeDays: leadTime,
          reviewPeriodDays: org.reviewPeriodDays,
          serviceLevel: Number(org.serviceLevel),
          minOrderQty: sp?.minOrderQty ? Number(sp.minOrderQty) : null,
          packSize: sp?.packSize ? Number(sp.packSize) : null,
          unitCost,
          allowFraction: p.allowFractionalQty,
          forecast: f,
          today: now,
        });
        if (!r.needed) continue;
        if (!supplier) r.reasons.push({ key: 'autopilot.noSupplier' });
        if (!sp) r.assumptions.leadTimeDays = `${leadTime} (default)`;
        r.assumptions.excludedStockoutDays = excludedStockoutDays;
        created.push({
          organizationId,
          productId: p.id,
          warehouseId: w.id,
          supplierId: supplier?.id ?? null,
          priority: r.priority,
          method: r.method,
          available: available.toFixed(3),
          onOrder: (onOrder.get(`${p.id}:${w.id}`) ?? 0).toFixed(3),
          averageDaily: r.averageDaily === null ? null : r.averageDaily.toFixed(4),
          leadTimeDays: leadTime,
          daysOfCover: r.daysOfCover === null ? null : r.daysOfCover.toFixed(1),
          stockoutDate: r.stockoutDate ? new Date(r.stockoutDate) : null,
          suggestedQty: r.suggestedQty.toFixed(3),
          unitCost: d(unitCost).toFixed(6),
          estimatedCost: r.estimatedCost,
          confidence: r.confidence,
          reasons: r.reasons as Prisma.InputJsonValue,
          assumptions: r.assumptions as Prisma.InputJsonValue,
          computedAt: now,
        });
      }
    }
    await this.prisma.tx(async (tx) => {
      await tx.replenishmentRecommendation.updateMany({ where: { organizationId, status: 'OPEN' }, data: { status: 'EXPIRED' } });
      if (created.length) await tx.replenishmentRecommendation.createMany({ data: created });
      const critical = created.filter((c) => c.priority === 'CRITICAL').length;
      if (critical > 0) {
        const key = `RECOMMENDATION:${now.toISOString().slice(0, 10)}`;
        await tx.notification.upsert({
          where: { organizationId_dedupeKey: { organizationId, dedupeKey: key } },
          create: { organizationId, type: 'RECOMMENDATION', params: { count: critical }, link: '/autopilot', dedupeKey: key },
          update: { params: { count: critical } },
        });
      }
    });
    return { computedAt: now, recommendations: created.length };
  }

  async list(ctx: TenantContext, status = 'OPEN') {
    const latest = await this.prisma.replenishmentRecommendation.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { computedAt: 'desc' } });
    if (status === 'OPEN' && (!latest || Date.now() - latest.computedAt.getTime() > STALE_AFTER_MS)) await this.run(ctx.organizationId);
    const recs = await this.prisma.replenishmentRecommendation.findMany({
      where: { organizationId: ctx.organizationId, status: status as never },
      orderBy: [{ priority: 'asc' }, { daysOfCover: 'asc' }],
      take: 500,
    });
    const [products, warehouses, suppliers] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: recs.map((r) => r.productId) } }, select: { id: true, name: true, sku: true, baseUnit: true } }),
      this.prisma.warehouse.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, name: true } }),
      this.prisma.supplier.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, name: true } }),
    ]);
    const pm = new Map(products.map((p) => [p.id, p]));
    const wm = new Map(warehouses.map((w) => [w.id, w]));
    const sm = new Map(suppliers.map((s) => [s.id, s]));
    const lastRun = await this.prisma.replenishmentRecommendation.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { computedAt: 'desc' }, select: { computedAt: true } });
    return {
      computedAt: lastRun?.computedAt ?? null,
      items: recs.map((r) => ({ ...r, product: pm.get(r.productId), warehouse: wm.get(r.warehouseId), supplier: r.supplierId ? sm.get(r.supplierId) ?? null : null })),
    };
  }

  async decide(ctx: TenantContext, id: string, input: z.infer<typeof decideRecommendationSchema>) {
    const rec = await this.prisma.replenishmentRecommendation.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!rec) throw AppError.notFound();
    if (rec.status !== 'OPEN') throw AppError.invalidState({ status: rec.status });
    if (input.decision === 'REJECT') {
      const res = await this.prisma.replenishmentRecommendation.updateMany({
        where: { id, status: 'OPEN' },
        data: { status: 'REJECTED', decidedAt: new Date(), decidedById: ctx.userId, decisionReason: input.reason },
      });
      if (res.count !== 1) throw AppError.invalidState();
      await this.audit.log(ctx, { action: 'autopilot.reject', entityType: 'ReplenishmentRecommendation', entityId: id, data: { reason: input.reason } });
      return { status: 'REJECTED' };
    }
    const supplierId = input.supplierId ?? rec.supplierId;
    if (!supplierId) throw new AppError('VALIDATION_FAILED', 400, { supplierId: 'required' });
    const qty = input.decision === 'MODIFY' ? input.quantity : rec.suggestedQty.toString();
    if (!qty) throw new AppError('VALIDATION_FAILED', 400, { quantity: 'required' });
    const sp = await this.prisma.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId, productId: rec.productId } } });
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, organizationId: ctx.organizationId } });
    if (!supplier) throw AppError.notFound({ supplierId });
    const lead = sp?.leadTimeDays ?? supplier.leadTimeDays;

    return this.prisma.tx(async (tx) => {
      const res = await tx.replenishmentRecommendation.updateMany({
        where: { id, status: 'OPEN' },
        data: {
          status: input.decision === 'MODIFY' ? 'MODIFIED' : 'APPROVED',
          decidedAt: new Date(),
          decidedById: ctx.userId,
          decisionQty: qty,
          decisionReason: input.reason,
        },
      });
      if (res.count !== 1) throw AppError.invalidState();
      const po = await this.purchasing.create(
        ctx,
        {
          supplierId,
          warehouseId: rec.warehouseId,
          expectedDate: new Date(Date.now() + lead * 86400_000).toISOString().slice(0, 10),
          notes: null,
          lines: [{ productId: rec.productId, quantity: qty, unitPrice: sp?.unitPrice.toString() ?? rec.unitCost.toFixed(3) }],
        },
        { source: 'AUTOPILOT', recommendationId: rec.id, tx },
      );
      await tx.replenishmentRecommendation.update({ where: { id }, data: { purchaseOrderId: po.id } });
      await this.audit.log(ctx, { action: `autopilot.${input.decision.toLowerCase()}`, entityType: 'ReplenishmentRecommendation', entityId: id, data: { quantity: qty, purchaseOrder: po.number } }, tx);
      return { status: input.decision === 'MODIFY' ? 'MODIFIED' : 'APPROVED', purchaseOrderId: po.id, purchaseOrderNumber: po.number };
    });
  }

  /** Cash-flow-aware plan: what the budget funds now and what gets deferred (projection only). */
  async budgetPlan(ctx: TenantContext, budget?: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
    const { items } = await this.list(ctx, 'OPEN');
    const effective = budget ?? org.purchaseBudget?.toString() ?? '0';
    const plan = allocateBudget(
      items.map((r) => ({
        id: r.id,
        priority: r.priority,
        estimatedCost: r.estimatedCost.toString(),
        daysOfCover: r.daysOfCover === null ? null : Number(r.daysOfCover),
        stockoutDate: r.stockoutDate ? r.stockoutDate.toISOString().slice(0, 10) : null,
        product: r.product,
        warehouse: r.warehouse,
        suggestedQty: r.suggestedQty.toString(),
      })),
      effective,
    );
    const byPriority = (xs: typeof plan.funded, p: string) => xs.filter((x) => x.priority === p);
    return {
      ...plan,
      isProjection: true,
      groups: {
        critical: byPriority(plan.funded, 'CRITICAL'),
        recommended: byPriority(plan.funded, 'RECOMMENDED'),
        deferrable: byPriority(plan.funded, 'DEFERRABLE'),
      },
    };
  }
}

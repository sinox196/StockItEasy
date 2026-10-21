import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { d, paginationQuery, supplierProductSchema, supplierSchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { pageArgs, paginated } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';

export const MIN_ORDERS_FOR_SCORE = 3;

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, q: z.infer<typeof paginationQuery>) {
    const where: Prisma.SupplierWhereInput = {
      organizationId: ctx.organizationId,
      ...(q.search
        ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search, mode: 'insensitive' } }, { city: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        ...pageArgs(q),
        include: { _count: { select: { products: true, purchaseOrders: true } } },
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  async get(ctx: TenantContext, id: string) {
    const s = await this.prisma.supplier.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        products: { include: { product: { select: { id: true, name: true, sku: true, baseUnit: true, purchasePrice: true } } } },
      },
    });
    if (!s) throw AppError.notFound();
    const [priceHistory, performance, orders] = await Promise.all([
      this.prisma.supplierPriceHistory.findMany({ where: { organizationId: ctx.organizationId, supplierId: id }, orderBy: { recordedAt: 'desc' }, take: 100 }),
      this.performance(ctx, id),
      this.prisma.purchaseOrder.findMany({
        where: { organizationId: ctx.organizationId, supplierId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, number: true, status: true, total: true, orderDate: true, expectedDate: true, receivedAt: true },
      }),
    ]);
    return { ...s, priceHistory, performance, orders };
  }

  async create(ctx: TenantContext, input: z.infer<typeof supplierSchema>, isDemo = false) {
    const s = await this.prisma.supplier.create({ data: { ...input, organizationId: ctx.organizationId, isDemo } });
    await this.audit.log(ctx, { action: 'supplier.create', entityType: 'Supplier', entityId: s.id, data: { name: s.name } });
    return s;
  }

  async update(ctx: TenantContext, id: string, input: z.infer<typeof supplierSchema>) {
    const res = await this.prisma.supplier.updateMany({ where: { id, organizationId: ctx.organizationId }, data: input });
    if (res.count !== 1) throw AppError.notFound();
    await this.audit.log(ctx, { action: 'supplier.update', entityType: 'Supplier', entityId: id, data: input });
    return this.prisma.supplier.findUniqueOrThrow({ where: { id } });
  }

  async upsertProduct(ctx: TenantContext, supplierId: string, input: z.infer<typeof supplierProductSchema>) {
    const [supplier, product] = await Promise.all([
      this.prisma.supplier.findFirst({ where: { id: supplierId, organizationId: ctx.organizationId } }),
      this.prisma.product.findFirst({ where: { id: input.productId, organizationId: ctx.organizationId } }),
    ]);
    if (!supplier || !product) throw AppError.notFound();
    return this.prisma.tx(async (tx) => {
      if (input.isPreferred) {
        await tx.supplierProduct.updateMany({ where: { productId: input.productId, organizationId: ctx.organizationId }, data: { isPreferred: false } });
        await tx.product.update({ where: { id: input.productId }, data: { preferredSupplierId: supplierId } });
      }
      const existing = await tx.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId, productId: input.productId } } });
      const sp = await tx.supplierProduct.upsert({
        where: { supplierId_productId: { supplierId, productId: input.productId } },
        create: { ...input, supplierId, organizationId: ctx.organizationId },
        update: input,
      });
      if (!existing || !existing.unitPrice.eq(new Prisma.Decimal(input.unitPrice))) {
        await tx.supplierPriceHistory.create({
          data: { organizationId: ctx.organizationId, supplierId, productId: input.productId, unitPrice: input.unitPrice, source: 'CATALOG' },
        });
      }
      await this.audit.log(ctx, { action: 'supplier.product_upsert', entityType: 'Supplier', entityId: supplierId, data: input }, tx);
      return sp;
    });
  }

  async removeProduct(ctx: TenantContext, supplierId: string, productId: string) {
    const res = await this.prisma.supplierProduct.deleteMany({ where: { supplierId, productId, organizationId: ctx.organizationId } });
    if (res.count !== 1) throw AppError.notFound();
  }

  /**
   * Explainable supplier score, computed only from the organization's own orders.
   * Components (each 0–100):
   *   - on-time: share of completed orders received on or before the expected date (+1 day tolerance)
   *   - fill rate: received quantity / ordered quantity on sent orders
   *   - price: how close the supplier's catalogue prices are to the cheapest known price per product
   * Score = 40 % on-time + 35 % fill rate + 25 % price. Returns null components when data is missing.
   */
  async performance(ctx: TenantContext, supplierId: string) {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { organizationId: ctx.organizationId, supplierId, status: { in: ['SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'] } },
      include: { lines: true, receipts: { where: { status: 'POSTED' }, orderBy: { receivedAt: 'asc' } } },
    });
    const completed = orders.filter((o) => o.status === 'RECEIVED');
    const withExpected = completed.filter((o) => o.expectedDate && o.receivedAt);
    const onTime = withExpected.filter((o) => o.receivedAt!.getTime() <= o.expectedDate!.getTime() + 2 * 86400_000).length;
    const onTimeRate = withExpected.length ? (onTime / withExpected.length) * 100 : null;

    let ordered = d(0);
    let received = d(0);
    for (const o of orders) for (const l of o.lines) {
      ordered = ordered.plus(d(l.quantity.toString()));
      received = received.plus(d(l.quantityReceived.toString()));
    }
    const fillRate = ordered.gt(0) ? received.div(ordered).times(100).toNumber() : null;

    const leadTimes = orders
      .filter((o) => o.receipts.length > 0)
      .map((o) => (o.receipts[0].receivedAt.getTime() - (o.sentAt ?? o.orderDate).getTime()) / 86400_000);
    const avgLeadTimeDays = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null;

    const catalog = await this.prisma.supplierProduct.findMany({ where: { organizationId: ctx.organizationId, supplierId } });
    let priceIndex: number | null = null;
    if (catalog.length) {
      const mins = await this.prisma.supplierProduct.groupBy({
        by: ['productId'],
        where: { organizationId: ctx.organizationId, productId: { in: catalog.map((c) => c.productId) } },
        _min: { unitPrice: true },
        _count: { _all: true },
      });
      const compared = mins.filter((m) => m._count._all > 1);
      if (compared.length) {
        const ratios = compared.map((m) => {
          const mine = catalog.find((c) => c.productId === m.productId)!;
          const min = d(m._min.unitPrice?.toString() ?? 0);
          return d(mine.unitPrice.toString()).gt(0) ? min.div(d(mine.unitPrice.toString())).toNumber() : 1;
        });
        priceIndex = (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100;
      }
    }

    const sufficient = completed.length >= MIN_ORDERS_FOR_SCORE;
    const parts: [number | null, number][] = [
      [onTimeRate, 0.4],
      [fillRate, 0.35],
      [priceIndex, 0.25],
    ];
    const available = parts.filter(([v]) => v !== null) as [number, number][];
    const weight = available.reduce((a, [, w]) => a + w, 0);
    const score = sufficient && weight > 0 ? available.reduce((a, [v, w]) => a + v * w, 0) / weight : null;
    const r = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
    return {
      sufficientData: sufficient,
      ordersConsidered: orders.length,
      completedOrders: completed.length,
      onTimeRate: r(onTimeRate),
      fillRate: r(fillRate),
      priceIndex: r(priceIndex),
      avgLeadTimeDays: r(avgLeadTimeDays),
      score: r(score),
      weights: { onTime: 0.4, fillRate: 0.35, price: 0.25 },
    };
  }
}

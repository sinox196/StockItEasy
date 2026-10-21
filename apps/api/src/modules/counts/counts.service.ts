import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { countLineSchema, createCountSchema, d, Decimal, paginationQuery } from '@stockiteasy/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { pageArgs, paginated } from '../../common/pagination';
import { SequenceService } from '../../common/sequence.service';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { InventoryEngine } from '../inventory/inventory.engine';

export interface CountLineResult {
  lineId: string;
  productId: string;
  expectedQty: string;
  countedQty: string;
  version: number;
}

/**
 * Physical inventory.
 * - FULL counts every active product, PARTIAL a selection, CYCLE the 25 most
 *   valuable stocked products not counted in the last 30 days.
 * - When a line is counted, its theoretical quantity is refreshed to the on-hand
 *   quantity at that moment; validation posts (counted − theoretical) as
 *   COUNT_ADJUSTMENT movements. Uncounted lines are ignored.
 */
@Injectable()
export class CountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: InventoryEngine,
    private readonly audit: AuditService,
    private readonly seq: SequenceService,
  ) {}

  async create(ctx: TenantContext, input: z.infer<typeof createCountSchema>) {
    return this.prisma.tx(async (tx) => {
      const wh = await tx.warehouse.findFirst({ where: { id: input.warehouseId, organizationId: ctx.organizationId } });
      if (!wh) throw AppError.notFound({ warehouseId: input.warehouseId });
      let productIds: string[];
      if (input.scope === 'FULL') {
        productIds = (await tx.product.findMany({ where: { organizationId: ctx.organizationId, status: 'ACTIVE' }, select: { id: true } })).map((p) => p.id);
      } else if (input.scope === 'CYCLE') {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT p.id FROM products p
          JOIN inventory_balances b ON b."productId" = p.id AND b."warehouseId" = ${input.warehouseId}::uuid
          WHERE p."organizationId" = ${ctx.organizationId}::uuid AND p.status = 'ACTIVE'
            AND NOT EXISTS (
              SELECT 1 FROM inventory_count_lines l JOIN physical_inventories c ON c.id = l."countId"
              WHERE l."productId" = p.id AND c."warehouseId" = ${input.warehouseId}::uuid
                AND l."countedAt" > now() - interval '30 days')
          ORDER BY b."quantityOnHand" * p."averageCost" DESC
          LIMIT 25`;
        productIds = rows.map((r) => r.id);
      } else {
        const where: Prisma.ProductWhereInput = { organizationId: ctx.organizationId, status: { not: 'ARCHIVED' } };
        if (input.productIds?.length) where.id = { in: input.productIds };
        else if (input.categoryId) where.categoryId = input.categoryId;
        else where.id = { in: [] };
        productIds = (await tx.product.findMany({ where, select: { id: true } })).map((p) => p.id);
      }
      const balances = new Map(
        (await tx.inventoryBalance.findMany({ where: { warehouseId: input.warehouseId, productId: { in: productIds } } })).map((b) => [b.productId, b.quantityOnHand]),
      );
      const count = await tx.physicalInventory.create({
        data: {
          organizationId: ctx.organizationId,
          number: await this.seq.next(tx, ctx.organizationId, 'INV'),
          warehouseId: input.warehouseId,
          scope: input.scope,
          note: input.note,
          createdById: ctx.userId,
          lines: { create: productIds.map((productId) => ({ productId, expectedQty: balances.get(productId) ?? 0 })) },
        },
      });
      await this.audit.log(ctx, { action: 'count.create', entityType: 'PhysicalInventory', entityId: count.id, data: { scope: input.scope, lines: productIds.length } }, tx);
      return this.getTx(tx, ctx, count.id);
    });
  }

  /** Records a counted quantity. Used by the web screen and by mobile offline sync. */
  async recordLine(
    ctx: TenantContext,
    countId: string,
    input: z.infer<typeof countLineSchema>,
    opts: { tx?: Tx; baseVersion?: number } = {},
  ): Promise<{ status: 'APPLIED' | 'CONFLICT'; line: CountLineResult }> {
    const run = async (tx: Tx) => {
      const count = await tx.physicalInventory.findFirst({ where: { id: countId, organizationId: ctx.organizationId } });
      if (!count) throw AppError.notFound();
      if (count.status !== 'IN_PROGRESS') throw AppError.invalidState({ status: count.status });
      const product = await tx.product.findFirst({ where: { id: input.productId, organizationId: ctx.organizationId } });
      if (!product) throw AppError.notFound({ productId: input.productId });
      if (!product.allowFractionalQty && !d(input.countedQty).isInteger()) throw new AppError('UNIT_CONVERSION', 400);

      await tx.$executeRaw`
        INSERT INTO inventory_count_lines (id, "countId", "productId", "expectedQty", version)
        VALUES (gen_random_uuid(), ${countId}::uuid, ${input.productId}::uuid, 0, 0)
        ON CONFLICT ("countId", "productId") DO NOTHING`;
      const [line] = await tx.$queryRaw<{ id: string; countedQty: Prisma.Decimal | null; version: number; countedById: string | null }[]>`
        SELECT id, "countedQty", version, "countedById" FROM inventory_count_lines
        WHERE "countId" = ${countId}::uuid AND "productId" = ${input.productId}::uuid FOR UPDATE`;
      const balance = await tx.inventoryBalance.findUnique({ where: { productId_warehouseId: { productId: input.productId, warehouseId: count.warehouseId } } });
      const expected = balance?.quantityOnHand ?? new Prisma.Decimal(0);

      // A replace from a device that saw an older version of a line someone else counted is a conflict:
      // never silently overwrite another person's count.
      if (
        input.mode === 'replace' &&
        opts.baseVersion !== undefined &&
        line.version !== opts.baseVersion &&
        line.countedQty !== null &&
        line.countedById !== ctx.userId
      ) {
        return {
          status: 'CONFLICT' as const,
          line: { lineId: line.id, productId: input.productId, expectedQty: expected.toString(), countedQty: line.countedQty.toString(), version: line.version },
        };
      }
      const counted = input.mode === 'add' ? d(line.countedQty?.toString() ?? 0).plus(d(input.countedQty)) : d(input.countedQty);
      const updated = await tx.inventoryCountLine.update({
        where: { id: line.id },
        data: {
          countedQty: counted.toFixed(3),
          expectedQty: expected,
          countedById: ctx.userId,
          countedAt: input.countedAt ? new Date(input.countedAt) : new Date(),
          version: { increment: 1 },
        },
      });
      return {
        status: 'APPLIED' as const,
        line: { lineId: updated.id, productId: updated.productId, expectedQty: updated.expectedQty.toString(), countedQty: counted.toFixed(3), version: updated.version },
      };
    };
    return opts.tx ? run(opts.tx) : this.prisma.tx(run);
  }

  async validate(ctx: TenantContext, id: string) {
    return this.prisma.tx(async (tx) => {
      const count = await tx.physicalInventory.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { lines: true } });
      if (!count) throw AppError.notFound();
      const res = await tx.physicalInventory.updateMany({
        where: { id, status: 'IN_PROGRESS' },
        data: { status: 'VALIDATED', validatedAt: new Date(), validatedById: ctx.userId },
      });
      if (res.count !== 1) throw AppError.invalidState({ status: count.status });
      const settings = await this.engine.orgSettings(tx, ctx.organizationId);
      let adjustments = 0;
      let varianceValue = new Decimal(0);
      for (const line of count.lines.filter((l) => l.countedQty !== null).sort((a, b) => a.productId.localeCompare(b.productId))) {
        const delta = d(line.countedQty!.toString()).minus(d(line.expectedQty.toString()));
        if (delta.isZero()) continue;
        const r = await this.engine.apply(
          tx,
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            productId: line.productId,
            warehouseId: count.warehouseId,
            type: 'COUNT_ADJUSTMENT',
            direction: delta.gt(0) ? 'IN' : 'OUT',
            quantity: delta.abs(),
            referenceType: 'COUNT',
            referenceId: count.id,
            reason: 'CORRECTION',
            skipAvailabilityCheck: true,
          },
          settings,
        );
        varianceValue = varianceValue.plus(delta.gt(0) ? r.totalCost : r.totalCost.negated());
        adjustments++;
      }
      await this.audit.log(ctx, { action: 'count.validate', entityType: 'PhysicalInventory', entityId: id, data: { adjustments, varianceValue: varianceValue.toFixed(3) } }, tx);
      return { adjustments, varianceValue: varianceValue.toFixed(3) };
    });
  }

  async cancel(ctx: TenantContext, id: string) {
    const res = await this.prisma.physicalInventory.updateMany({ where: { id, organizationId: ctx.organizationId, status: 'IN_PROGRESS' }, data: { status: 'CANCELLED' } });
    if (res.count !== 1) throw AppError.invalidState();
    await this.audit.log(ctx, { action: 'count.cancel', entityType: 'PhysicalInventory', entityId: id });
  }

  async list(ctx: TenantContext, q: z.infer<typeof paginationQuery> & { status?: string }) {
    const where: Prisma.PhysicalInventoryWhereInput = { organizationId: ctx.organizationId, status: q.status ? (q.status as never) : undefined };
    const [items, total] = await Promise.all([
      this.prisma.physicalInventory.findMany({ where, orderBy: { createdAt: q.order }, ...pageArgs(q) }),
      this.prisma.physicalInventory.count({ where }),
    ]);
    const stats = await this.prisma.inventoryCountLine.groupBy({
      by: ['countId'],
      where: { countId: { in: items.map((i) => i.id) } },
      _count: { _all: true, countedQty: true },
    });
    const sm = new Map(stats.map((s) => [s.countId, s._count]));
    const wh = new Map((await this.prisma.warehouse.findMany({ where: { organizationId: ctx.organizationId } })).map((w) => [w.id, w.name]));
    return paginated(
      items.map((c) => ({ ...c, warehouseName: wh.get(c.warehouseId), totalLines: sm.get(c.id)?._all ?? 0, countedLines: sm.get(c.id)?.countedQty ?? 0 })),
      total,
      q,
    );
  }

  get(ctx: TenantContext, id: string) {
    return this.getTx(this.prisma, ctx, id);
  }

  private async getTx(tx: Tx | PrismaService, ctx: TenantContext, id: string) {
    const c = await tx.physicalInventory.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { lines: true } });
    if (!c) throw AppError.notFound();
    const products = await tx.product.findMany({
      where: { id: { in: c.lines.map((l) => l.productId) } },
      select: { id: true, name: true, sku: true, baseUnit: true, averageCost: true, barcodes: { select: { code: true } } },
    });
    const pm = new Map(products.map((p) => [p.id, p]));
    const warehouse = await tx.warehouse.findUnique({ where: { id: c.warehouseId }, select: { id: true, name: true } });
    const lines = c.lines
      .map((l) => {
        const p = pm.get(l.productId);
        const variance = l.countedQty === null ? null : d(l.countedQty.toString()).minus(d(l.expectedQty.toString()));
        return {
          ...l,
          product: p ? { id: p.id, name: p.name, sku: p.sku, baseUnit: p.baseUnit, barcodes: p.barcodes.map((b) => b.code) } : undefined,
          variance: variance?.toFixed(3) ?? null,
          varianceValue: variance && p ? variance.times(d(p.averageCost.toString())).toFixed(3) : null,
        };
      })
      .sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? ''));
    return { ...c, warehouse, lines };
  }
}

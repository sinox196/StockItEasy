import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { d, paginationQuery, receiveTransferSchema, transferSchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { pageArgs, paginated } from '../../common/pagination';
import { SequenceService } from '../../common/sequence.service';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { InventoryEngine } from '../inventory/inventory.engine';

/**
 * Transfer lifecycle: DRAFT → IN_TRANSIT (stock leaves the source) → RECEIVED (stock
 * enters the destination). Cancelling an in-transit transfer returns the goods to
 * the source. Every status change is a conditional update, so two concurrent
 * clicks cannot ship or receive twice.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: InventoryEngine,
    private readonly audit: AuditService,
    private readonly seq: SequenceService,
  ) {}

  async create(ctx: TenantContext, input: z.infer<typeof transferSchema>) {
    return this.prisma.tx(async (tx) => {
      const whs = await tx.warehouse.findMany({ where: { organizationId: ctx.organizationId, id: { in: [input.fromWarehouseId, input.toWarehouseId] } } });
      if (whs.length !== 2) throw AppError.notFound({ warehouse: 'unknown' });
      const productIds = [...new Set(input.lines.map((l) => l.productId))];
      const count = await tx.product.count({ where: { organizationId: ctx.organizationId, id: { in: productIds } } });
      if (count !== productIds.length) throw AppError.notFound({ product: 'unknown' });
      const t = await tx.stockTransfer.create({
        data: {
          organizationId: ctx.organizationId,
          number: await this.seq.next(tx, ctx.organizationId, 'TR'),
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          note: input.note,
          createdById: ctx.userId,
          lines: { create: input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) },
        },
        include: { lines: true },
      });
      await this.audit.log(ctx, { action: 'transfer.create', entityType: 'StockTransfer', entityId: t.id, data: { number: t.number } }, tx);
      return t;
    });
  }

  private async transition(tx: Tx, ctx: TenantContext, id: string, from: Prisma.EnumTransferStatusFilter['equals'][], data: Prisma.StockTransferUpdateManyMutationInput) {
    const t = await tx.stockTransfer.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { lines: true } });
    if (!t) throw AppError.notFound();
    const res = await tx.stockTransfer.updateMany({ where: { id, status: { in: from as never } }, data });
    if (res.count !== 1) throw AppError.invalidState({ status: t.status });
    return t;
  }

  async ship(ctx: TenantContext, id: string) {
    return this.prisma.tx(async (tx) => {
      const t = await this.transition(tx, ctx, id, ['DRAFT'], { status: 'IN_TRANSIT', shippedAt: new Date() });
      const settings = await this.engine.orgSettings(tx, ctx.organizationId);
      for (const line of [...t.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const r = await this.engine.apply(
          tx,
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            productId: line.productId,
            warehouseId: t.fromWarehouseId,
            type: 'TRANSFER_OUT',
            quantity: line.quantity.toString(),
            referenceType: 'TRANSFER',
            referenceId: t.id,
          },
          settings,
        );
        await tx.stockTransferLine.update({ where: { id: line.id }, data: { unitCost: r.unitCost.toFixed(6) } });
      }
      await tx.notification.create({
        data: {
          organizationId: ctx.organizationId,
          type: 'TRANSFER_PENDING',
          params: { number: t.number, warehouse: (await tx.warehouse.findUnique({ where: { id: t.toWarehouseId } }))?.name ?? '' },
          link: `/transfers/${t.id}`,
          dedupeKey: `TRANSFER_PENDING:${t.id}`,
        },
      });
      await this.audit.log(ctx, { action: 'transfer.ship', entityType: 'StockTransfer', entityId: t.id }, tx);
      return this.getTx(tx, ctx, id);
    });
  }

  async receive(ctx: TenantContext, id: string, input: z.infer<typeof receiveTransferSchema>) {
    return this.prisma.tx(async (tx) => {
      const t = await this.transition(tx, ctx, id, ['IN_TRANSIT'], { status: 'RECEIVED', receivedAt: new Date() });
      const settings = await this.engine.orgSettings(tx, ctx.organizationId);
      const received = new Map(input.lines.map((l) => [l.lineId, d(l.quantityReceived)]));
      const discrepancies: { productId: string; sent: string; received: string }[] = [];
      for (const line of [...t.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const qty = received.get(line.id) ?? d(line.quantity.toString());
        if (qty.gt(d(line.quantity.toString()))) throw new AppError('OVER_RECEIPT', 422, { lineId: line.id });
        await tx.stockTransferLine.update({ where: { id: line.id }, data: { quantityReceived: qty.toFixed(3) } });
        if (!qty.eq(d(line.quantity.toString()))) discrepancies.push({ productId: line.productId, sent: line.quantity.toString(), received: qty.toFixed(3) });
        if (qty.gt(0)) {
          await this.engine.apply(
            tx,
            {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              productId: line.productId,
              warehouseId: t.toWarehouseId,
              type: 'TRANSFER_IN',
              quantity: qty,
              unitCost: line.unitCost.toString(),
              referenceType: 'TRANSFER',
              referenceId: t.id,
            },
            settings,
          );
        }
      }
      await tx.notification.updateMany({ where: { organizationId: ctx.organizationId, dedupeKey: `TRANSFER_PENDING:${t.id}` }, data: { dedupeKey: null, readAt: new Date() } });
      await this.audit.log(ctx, { action: 'transfer.receive', entityType: 'StockTransfer', entityId: t.id, data: { discrepancies, note: input.note } }, tx);
      return this.getTx(tx, ctx, id);
    });
  }

  async cancel(ctx: TenantContext, id: string) {
    return this.prisma.tx(async (tx) => {
      const t = await this.transition(tx, ctx, id, ['DRAFT', 'IN_TRANSIT'], { status: 'CANCELLED', cancelledAt: new Date() });
      if (t.status === 'IN_TRANSIT') {
        const settings = await this.engine.orgSettings(tx, ctx.organizationId);
        for (const line of [...t.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
          await this.engine.apply(
            tx,
            {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              productId: line.productId,
              warehouseId: t.fromWarehouseId,
              type: 'TRANSFER_IN',
              quantity: line.quantity.toString(),
              unitCost: line.unitCost.toString(),
              referenceType: 'TRANSFER',
              referenceId: t.id,
              note: 'cancelled',
            },
            settings,
          );
        }
        await tx.notification.updateMany({ where: { organizationId: ctx.organizationId, dedupeKey: `TRANSFER_PENDING:${t.id}` }, data: { dedupeKey: null, readAt: new Date() } });
      }
      await this.audit.log(ctx, { action: 'transfer.cancel', entityType: 'StockTransfer', entityId: t.id, data: { previousStatus: t.status } }, tx);
      return this.getTx(tx, ctx, id);
    });
  }

  async list(ctx: TenantContext, q: z.infer<typeof paginationQuery> & { status?: string }) {
    const where: Prisma.StockTransferWhereInput = {
      organizationId: ctx.organizationId,
      status: q.status ? (q.status as never) : undefined,
      number: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({ where, orderBy: { createdAt: q.order }, ...pageArgs(q), include: { _count: { select: { lines: true } } } }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    const wh = new Map(
      (await this.prisma.warehouse.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, name: true } })).map((w) => [w.id, w]),
    );
    return paginated(items.map((t) => ({ ...t, from: wh.get(t.fromWarehouseId), to: wh.get(t.toWarehouseId) })), total, q);
  }

  get(ctx: TenantContext, id: string) {
    return this.getTx(this.prisma, ctx, id);
  }

  private async getTx(tx: Tx | PrismaService, ctx: TenantContext, id: string) {
    const t = await tx.stockTransfer.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { lines: true } });
    if (!t) throw AppError.notFound();
    const [products, whs] = await Promise.all([
      tx.product.findMany({ where: { id: { in: t.lines.map((l) => l.productId) } }, select: { id: true, name: true, sku: true, baseUnit: true } }),
      tx.warehouse.findMany({ where: { id: { in: [t.fromWarehouseId, t.toWarehouseId] } }, select: { id: true, name: true } }),
    ]);
    const pm = new Map(products.map((p) => [p.id, p]));
    return {
      ...t,
      from: whs.find((w) => w.id === t.fromWarehouseId),
      to: whs.find((w) => w.id === t.toWarehouseId),
      lines: t.lines.map((l) => ({ ...l, product: pm.get(l.productId) })),
    };
  }
}

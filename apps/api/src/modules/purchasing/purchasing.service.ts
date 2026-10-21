import { Injectable } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import {
  computeDocument,
  CreatePurchaseOrderInput,
  d,
  purchaseOrderListQuery,
  ReceiveGoodsInput,
  updatePurchaseOrderSchema,
} from '@stockiteasy/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { pageArgs, paginated } from '../../common/pagination';
import { SequenceService } from '../../common/sequence.service';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { InventoryEngine } from '../inventory/inventory.engine';

/**
 * Purchase order workflow:
 *   DRAFT → (PENDING_APPROVAL) → APPROVED → SENT → PARTIALLY_RECEIVED → RECEIVED
 * Users holding purchases.approve may approve a draft directly. Nothing is sent to
 * a supplier automatically: "SENT" records that the buyer transmitted the order.
 * Receipts post RECEIPT movements; cancelling a receipt reverses them.
 */
@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: InventoryEngine,
    private readonly audit: AuditService,
    private readonly seq: SequenceService,
  ) {}

  private async buildLines(tx: Tx, ctx: TenantContext, lines: CreatePurchaseOrderInput['lines']) {
    const products = await tx.product.findMany({ where: { organizationId: ctx.organizationId, id: { in: lines.map((l) => l.productId) } } });
    const pm = new Map(products.map((p) => [p.id, p]));
    const resolved = lines.map((l) => {
      const p = pm.get(l.productId);
      if (!p) throw AppError.notFound({ productId: l.productId });
      return { ...l, taxRate: l.taxRate ?? p.taxRate.toString() };
    });
    const doc = computeDocument(resolved.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate })));
    return {
      lines: resolved.map((l, i) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, lineTotal: doc.lines[i].total.toFixed(3) })),
      totals: { subtotal: doc.subtotal.toFixed(3), taxTotal: doc.taxTotal.toFixed(3), total: doc.total.toFixed(3) },
    };
  }

  private async assertRefs(tx: Tx, ctx: TenantContext, supplierId?: string, warehouseId?: string) {
    if (supplierId && !(await tx.supplier.findFirst({ where: { id: supplierId, organizationId: ctx.organizationId } }))) throw AppError.notFound({ supplierId });
    if (warehouseId && !(await tx.warehouse.findFirst({ where: { id: warehouseId, organizationId: ctx.organizationId } }))) throw AppError.notFound({ warehouseId });
  }

  async create(
    ctx: TenantContext,
    input: CreatePurchaseOrderInput,
    opts: { source?: 'MANUAL' | 'AUTOPILOT'; recommendationId?: string; tx?: Tx; isDemo?: boolean; orderDate?: Date } = {},
  ) {
    const run = async (tx: Tx) => {
      await this.assertRefs(tx, ctx, input.supplierId, input.warehouseId);
      const { lines, totals } = await this.buildLines(tx, ctx, input.lines);
      const po = await tx.purchaseOrder.create({
        data: {
          organizationId: ctx.organizationId,
          number: await this.seq.next(tx, ctx.organizationId, 'BC', opts.orderDate),
          supplierId: input.supplierId,
          warehouseId: input.warehouseId,
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
          notes: input.notes,
          createdById: ctx.userId,
          source: opts.source ?? 'MANUAL',
          recommendationId: opts.recommendationId,
          isDemo: opts.isDemo ?? false,
          orderDate: opts.orderDate ?? new Date(),
          ...totals,
          lines: { create: lines },
        },
      });
      await this.audit.log(ctx, { action: 'purchase.create', entityType: 'PurchaseOrder', entityId: po.id, data: { number: po.number, total: totals.total, source: po.source } }, tx);
      return po;
    };
    const po = opts.tx ? await run(opts.tx) : await this.prisma.tx(run);
    return opts.tx ? po : this.get(ctx, po.id);
  }

  async update(ctx: TenantContext, id: string, input: z.infer<typeof updatePurchaseOrderSchema>) {
    await this.prisma.tx(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id, organizationId: ctx.organizationId } });
      if (!po) throw AppError.notFound();
      if (po.status !== 'DRAFT') throw AppError.invalidState({ status: po.status });
      await this.assertRefs(tx, ctx, input.supplierId, input.warehouseId);
      const data: Prisma.PurchaseOrderUpdateInput = {
        supplier: input.supplierId ? { connect: { id: input.supplierId } } : undefined,
        warehouseId: input.warehouseId,
        expectedDate: input.expectedDate === undefined ? undefined : input.expectedDate ? new Date(input.expectedDate) : null,
        notes: input.notes,
        version: { increment: 1 },
      };
      if (input.lines) {
        const { lines, totals } = await this.buildLines(tx, ctx, input.lines);
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
        Object.assign(data, totals, { lines: { create: lines } });
      }
      await tx.purchaseOrder.update({ where: { id }, data });
      await this.audit.log(ctx, { action: 'purchase.update', entityType: 'PurchaseOrder', entityId: id }, tx);
    });
    return this.get(ctx, id);
  }

  private async transition(ctx: TenantContext, id: string, from: PurchaseOrderStatus[], to: PurchaseOrderStatus, extra: Prisma.PurchaseOrderUpdateManyMutationInput = {}, action = `purchase.${to.toLowerCase()}`) {
    return this.prisma.tx(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id, organizationId: ctx.organizationId } });
      if (!po) throw AppError.notFound();
      const res = await tx.purchaseOrder.updateMany({ where: { id, status: { in: from } }, data: { status: to, version: { increment: 1 }, ...extra } });
      if (res.count !== 1) throw AppError.invalidState({ status: po.status });
      await this.audit.log(ctx, { action, entityType: 'PurchaseOrder', entityId: id, data: { from: po.status, to } }, tx);
      return po;
    });
  }

  async submit(ctx: TenantContext, id: string) {
    const po = await this.transition(ctx, id, ['DRAFT'], 'PENDING_APPROVAL');
    await this.prisma.notification.create({
      data: {
        organizationId: ctx.organizationId,
        type: 'PO_APPROVAL_REQUIRED',
        params: { number: po.number, total: po.total.toString() },
        link: `/purchases/${po.id}`,
        dedupeKey: `PO_APPROVAL:${po.id}`,
      },
    }).catch(() => undefined);
    return this.get(ctx, id);
  }

  async approve(ctx: TenantContext, id: string) {
    await this.transition(ctx, id, ['DRAFT', 'PENDING_APPROVAL'], 'APPROVED', { approvedAt: new Date(), approvedById: ctx.userId });
    await this.prisma.notification.updateMany({ where: { organizationId: ctx.organizationId, dedupeKey: `PO_APPROVAL:${id}` }, data: { dedupeKey: null, readAt: new Date() } });
    return this.get(ctx, id);
  }

  /** Records that the order was transmitted to the supplier; also logs the agreed prices. */
  async markSent(ctx: TenantContext, id: string) {
    await this.transition(ctx, id, ['APPROVED'], 'SENT', { sentAt: new Date() });
    const po = await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    await this.prisma.supplierPriceHistory.createMany({
      data: po.lines.map((l) => ({ organizationId: ctx.organizationId, supplierId: po.supplierId, productId: l.productId, unitPrice: l.unitPrice, source: 'PURCHASE_ORDER', sourceId: po.id })),
    });
    return this.get(ctx, id);
  }

  async cancel(ctx: TenantContext, id: string) {
    const posted = await this.prisma.goodsReceipt.count({ where: { purchaseOrderId: id, organizationId: ctx.organizationId, status: 'POSTED' } });
    if (posted > 0) throw AppError.invalidState({ reason: 'HAS_RECEIPTS' });
    await this.transition(ctx, id, ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'], 'CANCELLED', { cancelledAt: new Date() });
    return this.get(ctx, id);
  }

  async receive(ctx: TenantContext, id: string, input: ReceiveGoodsInput) {
    const receiptId = await this.prisma.tx(async (tx) => {
      // Lock the order so two receipts of the same lines cannot over-receive.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM purchase_orders WHERE id = ${id}::uuid AND "organizationId" = ${ctx.organizationId}::uuid FOR UPDATE`;
      if (!locked.length) throw AppError.notFound();
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      if (!['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status)) throw AppError.invalidState({ status: po.status });
      const warehouseId = input.warehouseId ?? po.warehouseId;
      await this.assertRefs(tx, ctx, undefined, warehouseId);

      const lineMap = new Map(po.lines.map((l) => [l.id, l]));
      const merged = new Map<string, Prisma.Decimal>();
      for (const l of input.lines) {
        if (!lineMap.has(l.lineId)) throw AppError.notFound({ lineId: l.lineId });
        merged.set(l.lineId, (merged.get(l.lineId) ?? new Prisma.Decimal(0)).plus(l.quantity));
      }
      for (const [lineId, qty] of merged) {
        const line = lineMap.get(lineId)!;
        if (line.quantityReceived.plus(qty).gt(line.quantity)) {
          throw AppError.unprocessable('OVER_RECEIPT', { lineId, ordered: line.quantity.toString(), alreadyReceived: line.quantityReceived.toString(), receiving: qty.toString() });
        }
      }

      const receipt = await tx.goodsReceipt.create({
        data: {
          organizationId: ctx.organizationId,
          number: await this.seq.next(tx, ctx.organizationId, 'BR'),
          purchaseOrderId: id,
          warehouseId,
          note: input.note,
          receivedById: ctx.userId,
        },
      });
      const settings = await this.engine.orgSettings(tx, ctx.organizationId);
      const sorted = [...input.lines].sort((a, b) => lineMap.get(a.lineId)!.productId.localeCompare(lineMap.get(b.lineId)!.productId));
      for (const l of sorted) {
        const line = lineMap.get(l.lineId)!;
        const unitCost = l.unitCost ?? line.unitPrice.toString();
        const rl = await tx.goodsReceiptLine.create({
          data: {
            receiptId: receipt.id,
            poLineId: line.id,
            productId: line.productId,
            quantity: l.quantity,
            unitCost,
            lotNumber: l.lotNumber,
            expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
            discrepancyReason: l.discrepancyReason,
          },
        });
        await this.engine.apply(
          tx,
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            productId: line.productId,
            warehouseId,
            type: 'RECEIPT',
            quantity: l.quantity,
            unitCost,
            referenceType: 'GOODS_RECEIPT',
            referenceId: receipt.id,
            lotNumber: l.lotNumber,
            expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
            costSource: { type: 'GOODS_RECEIPT_LINE', id: rl.id },
          },
          settings,
        );
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { quantityReceived: { increment: l.quantity } } });
        await tx.product.update({ where: { id: line.productId }, data: { purchasePrice: unitCost } });
        if (!d(unitCost).eq(d(line.unitPrice.toString()))) {
          await tx.supplierPriceHistory.create({
            data: { organizationId: ctx.organizationId, supplierId: po.supplierId, productId: line.productId, unitPrice: unitCost, source: 'RECEIPT', sourceId: receipt.id },
          });
        }
      }
      await this.refreshStatus(tx, id);
      await this.audit.log(ctx, { action: 'purchase.receive', entityType: 'PurchaseOrder', entityId: id, data: { receipt: receipt.number, lines: input.lines.length } }, tx);
      return receipt.id;
    });
    return { receiptId, order: await this.get(ctx, id) };
  }

  private async refreshStatus(tx: Tx, id: string) {
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    const anyReceived = po.lines.some((l) => l.quantityReceived.gt(0));
    const allReceived = po.lines.every((l) => l.quantityReceived.gte(l.quantity));
    const status: PurchaseOrderStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.sentAt ? 'SENT' : 'APPROVED';
    await tx.purchaseOrder.update({ where: { id }, data: { status, receivedAt: allReceived ? new Date() : null, version: { increment: 1 } } });
  }

  /** Reverses a receipt. Fails with INSUFFICIENT_STOCK if the goods were already sold or moved. */
  async cancelReceipt(ctx: TenantContext, receiptId: string) {
    return this.prisma.tx(async (tx) => {
      const receipt = await tx.goodsReceipt.findFirst({ where: { id: receiptId, organizationId: ctx.organizationId }, include: { lines: true } });
      if (!receipt) throw AppError.notFound();
      const res = await tx.goodsReceipt.updateMany({ where: { id: receiptId, status: 'POSTED' }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      if (res.count !== 1) throw AppError.invalidState({ status: receipt.status });
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${receipt.purchaseOrderId}::uuid FOR UPDATE`;
      const settings = await this.engine.orgSettings(tx, ctx.organizationId);
      for (const line of [...receipt.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        await this.engine.apply(
          tx,
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            productId: line.productId,
            warehouseId: receipt.warehouseId,
            type: 'RECEIPT_REVERSAL',
            quantity: line.quantity.toString(),
            unitCost: line.unitCost.toString(),
            referenceType: 'GOODS_RECEIPT',
            referenceId: receipt.id,
            lotNumber: line.lotNumber,
            costSource: { type: 'GOODS_RECEIPT_LINE', id: line.id },
          },
          settings,
        );
        await tx.purchaseOrderLine.update({ where: { id: line.poLineId }, data: { quantityReceived: { decrement: line.quantity } } });
      }
      await this.refreshStatus(tx, receipt.purchaseOrderId);
      await this.audit.log(ctx, { action: 'purchase.receipt_cancel', entityType: 'GoodsReceipt', entityId: receiptId, data: { number: receipt.number } }, tx);
      return { cancelled: true, purchaseOrderId: receipt.purchaseOrderId };
    });
  }

  async list(ctx: TenantContext, q: z.infer<typeof purchaseOrderListQuery>) {
    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId: ctx.organizationId,
      status: q.status,
      supplierId: q.supplierId,
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { supplier: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: q.order },
        ...pageArgs(q),
        include: { supplier: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  async get(ctx: TenantContext, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        supplier: true,
        lines: true,
        receipts: { include: { lines: true }, orderBy: { receivedAt: 'desc' } },
      },
    });
    if (!po) throw AppError.notFound();
    const products = await this.prisma.product.findMany({
      where: { id: { in: po.lines.map((l) => l.productId) } },
      select: { id: true, name: true, sku: true, baseUnit: true, tracking: true, hasExpiry: true },
    });
    const pm = new Map(products.map((p) => [p.id, p]));
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: po.warehouseId }, select: { id: true, name: true } });
    return {
      ...po,
      warehouse,
      lines: po.lines.map((l) => ({ ...l, product: pm.get(l.productId), remaining: l.quantity.minus(l.quantityReceived).toString() })),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  addPaymentSchema,
  computeLine,
  CreateSaleInput,
  customerReturnSchema,
  customerSchema,
  d,
  Decimal,
  paginationQuery,
  paymentStatus,
  roundMoney,
  salesListQuery,
  sum,
} from '@stockiteasy/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { can, TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { pageArgs, paginated } from '../../common/pagination';
import { SequenceService } from '../../common/sequence.service';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { InventoryEngine } from '../inventory/inventory.engine';

/**
 * Sales and POS.
 * A sale is posted in one transaction: lines are priced (HT + VAT), stock leaves
 * the warehouse through SALE movements (COGS captured per line), and payments are
 * recorded. CREDIT puts the unpaid amount on the customer's account, within the
 * customer's credit limit. Concurrent sales of the last unit are serialised by the
 * stock engine's row locks: the second one fails with INSUFFICIENT_STOCK.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: InventoryEngine,
    private readonly audit: AuditService,
    private readonly seq: SequenceService,
  ) {}

  async create(ctx: TenantContext, input: CreateSaleInput, opts: { tx?: Tx; occurredAt?: Date; isDemo?: boolean } = {}) {
    const run = async (tx: Tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
      const wh = await tx.warehouse.findFirst({ where: { id: input.warehouseId, organizationId: ctx.organizationId } });
      if (!wh) throw AppError.notFound({ warehouseId: input.warehouseId });
      const customer = input.customerId ? await tx.customer.findFirst({ where: { id: input.customerId, organizationId: ctx.organizationId } }) : null;
      if (input.customerId && !customer) throw AppError.notFound({ customerId: input.customerId });

      const products = await tx.product.findMany({ where: { organizationId: ctx.organizationId, id: { in: input.lines.map((l) => l.productId) } } });
      const pm = new Map(products.map((p) => [p.id, p]));
      const priced = input.lines.map((l) => {
        const p = pm.get(l.productId);
        if (!p) throw AppError.notFound({ productId: l.productId });
        if (p.status !== 'ACTIVE') throw AppError.unprocessable('PRODUCT_INACTIVE', { productId: p.id });
        if (!p.allowFractionalQty && !d(l.quantity).isInteger()) throw new AppError('UNIT_CONVERSION', 400, { productId: p.id });
        const unitPrice = l.unitPrice ?? p.salePrice.toString();
        const discountRate = l.discountRate ?? '0';
        const netUnit = d(unitPrice).times(d(100).minus(d(discountRate))).div(100);
        if (p.minSalePrice && netUnit.lt(d(p.minSalePrice.toString())) && !can(ctx, 'sales.approve')) {
          throw AppError.unprocessable('PRICE_BELOW_MINIMUM', { productId: p.id, minSalePrice: p.minSalePrice.toString() });
        }
        const totals = computeLine({ quantity: l.quantity, unitPrice, discountRate, taxRate: p.taxRate.toString() });
        return { line: l, product: p, unitPrice, discountRate, totals };
      });
      const total = sum(priced.map((x) => x.totals.total));
      const subtotal = sum(priced.map((x) => x.totals.net));
      const taxTotal = sum(priced.map((x) => x.totals.tax));
      const discountTotal = sum(priced.map((x) => x.totals.discount));

      // Payments
      for (const p of input.payments) {
        if (!org.enabledPaymentMethods.includes(p.method)) throw new AppError('VALIDATION_FAILED', 400, { method: p.method });
      }
      const credit = sum(input.payments.filter((p) => p.method === 'CREDIT').map((p) => p.amount));
      const paid = sum(input.payments.filter((p) => p.method !== 'CREDIT').map((p) => p.amount));
      if (paid.plus(credit).gt(total)) throw AppError.unprocessable('PAYMENT_EXCEEDS_TOTAL', { total: total.toFixed(3) });
      const due = total.minus(paid);
      if (due.gt(0)) {
        if (!customer) throw AppError.unprocessable('CREDIT_REQUIRES_CUSTOMER');
        if (customer.creditLimit && d(customer.balance.toString()).plus(due).gt(d(customer.creditLimit.toString()))) {
          throw AppError.unprocessable('CREDIT_LIMIT_EXCEEDED', { balance: customer.balance.toString(), limit: customer.creditLimit.toString() });
        }
      }

      const occurredAt = opts.occurredAt ?? new Date();
      const sale = await tx.salesOrder.create({
        data: {
          organizationId: ctx.organizationId,
          number: await this.seq.next(tx, ctx.organizationId, 'V', occurredAt),
          customerId: customer?.id,
          warehouseId: input.warehouseId,
          channel: input.channel,
          subtotal: subtotal.toFixed(3),
          discountTotal: discountTotal.toFixed(3),
          taxTotal: taxTotal.toFixed(3),
          total: total.toFixed(3),
          paidTotal: paid.toFixed(3),
          paymentStatus: paymentStatus(total, paid),
          note: input.note,
          createdById: ctx.userId,
          isDemo: opts.isDemo ?? false,
          completedAt: occurredAt,
          createdAt: occurredAt,
        },
      });

      // Stock: one movement per product, in a stable lock order.
      const settings = await this.engine.orgSettings(tx, ctx.organizationId);
      const qtyByProduct = new Map<string, Decimal>();
      for (const x of priced) qtyByProduct.set(x.product.id, (qtyByProduct.get(x.product.id) ?? d(0)).plus(d(x.line.quantity)));
      const unitCosts = new Map<string, Decimal>();
      for (const productId of [...qtyByProduct.keys()].sort()) {
        const r = await this.engine.apply(
          tx,
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            productId,
            warehouseId: input.warehouseId,
            type: 'SALE',
            quantity: qtyByProduct.get(productId)!,
            referenceType: 'SALE',
            referenceId: sale.id,
            occurredAt,
          },
          settings,
        );
        unitCosts.set(productId, r.unitCost);
      }

      let costTotal = d(0);
      for (const x of priced) {
        const unitCost = unitCosts.get(x.product.id) ?? d(0);
        const lineCost = roundMoney(unitCost.times(d(x.line.quantity)));
        costTotal = costTotal.plus(lineCost);
        await tx.salesOrderLine.create({
          data: {
            salesOrderId: sale.id,
            productId: x.product.id,
            quantity: x.line.quantity,
            unitPrice: x.unitPrice,
            discountRate: x.discountRate,
            taxRate: x.product.taxRate,
            netTotal: x.totals.net.toFixed(3),
            taxTotal: x.totals.tax.toFixed(3),
            lineTotal: x.totals.total.toFixed(3),
            unitCost: unitCost.toFixed(6),
            costTotal: lineCost.toFixed(3),
          },
        });
      }
      await tx.salesOrder.update({ where: { id: sale.id }, data: { costTotal: costTotal.toFixed(3) } });

      for (const p of input.payments.filter((p) => p.method !== 'CREDIT' && d(p.amount).gt(0))) {
        await tx.payment.create({
          data: { organizationId: ctx.organizationId, salesOrderId: sale.id, method: p.method, amount: p.amount, reference: p.reference, receivedById: ctx.userId, paidAt: occurredAt },
        });
      }
      if (customer && due.gt(0)) {
        await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: due.toFixed(3) } } });
      }
      await this.audit.log(ctx, { action: 'sale.create', entityType: 'SalesOrder', entityId: sale.id, data: { number: sale.number, total: total.toFixed(3), lines: input.lines.length } }, tx);
      return sale.id;
    };
    const id = opts.tx ? await run(opts.tx) : await this.prisma.tx(run);
    return opts.tx ? { id } : this.get(ctx, id);
  }

  async addPayment(ctx: TenantContext, id: string, input: z.infer<typeof addPaymentSchema>) {
    await this.prisma.tx(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sales_orders WHERE id = ${id}::uuid AND "organizationId" = ${ctx.organizationId}::uuid FOR UPDATE`;
      if (!rows.length) throw AppError.notFound();
      const sale = await tx.salesOrder.findUniqueOrThrow({ where: { id } });
      if (sale.status === 'CANCELLED') throw AppError.invalidState();
      if (input.method === 'CREDIT') throw new AppError('VALIDATION_FAILED', 400, { method: 'CREDIT' });
      const due = d(sale.total.toString()).minus(d(sale.refundedTotal.toString())).minus(d(sale.paidTotal.toString()));
      if (d(input.amount).gt(due)) throw AppError.unprocessable('PAYMENT_EXCEEDS_TOTAL', { due: due.toFixed(3) });
      await tx.payment.create({ data: { organizationId: ctx.organizationId, salesOrderId: id, method: input.method, amount: input.amount, reference: input.reference, receivedById: ctx.userId } });
      const paid = d(sale.paidTotal.toString()).plus(d(input.amount));
      await tx.salesOrder.update({
        where: { id },
        data: { paidTotal: paid.toFixed(3), paymentStatus: paymentStatus(d(sale.total.toString()).minus(d(sale.refundedTotal.toString())), paid) },
      });
      if (sale.customerId) await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { decrement: input.amount } } });
      await this.audit.log(ctx, { action: 'sale.payment', entityType: 'SalesOrder', entityId: id, data: input }, tx);
    });
    return this.get(ctx, id);
  }

  async createReturn(ctx: TenantContext, id: string, input: z.infer<typeof customerReturnSchema>) {
    await this.prisma.tx(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sales_orders WHERE id = ${id}::uuid AND "organizationId" = ${ctx.organizationId}::uuid FOR UPDATE`;
      if (!rows.length) throw AppError.notFound();
      const sale = await tx.salesOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      if (sale.status === 'CANCELLED' || sale.status === 'RETURNED') throw AppError.invalidState({ status: sale.status });
      const lm = new Map(sale.lines.map((l) => [l.id, l]));
      const settings = await this.engine.orgSettings(tx, ctx.organizationId);
      let amount = d(0);
      const sorted = [...input.lines].sort((a, b) => (lm.get(a.lineId)?.productId ?? '').localeCompare(lm.get(b.lineId)?.productId ?? ''));
      for (const r of sorted) {
        const line = lm.get(r.lineId);
        if (!line) throw AppError.notFound({ lineId: r.lineId });
        const remaining = d(line.quantity.toString()).minus(d(line.returnedQty.toString()));
        if (d(r.quantity).gt(remaining)) throw AppError.unprocessable('RETURN_EXCEEDS_SOLD', { lineId: r.lineId, remaining: remaining.toFixed(3) });
        amount = amount.plus(roundMoney(d(line.lineTotal.toString()).times(d(r.quantity)).div(d(line.quantity.toString()))));
        await this.engine.apply(
          tx,
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            productId: line.productId,
            warehouseId: sale.warehouseId,
            type: 'CUSTOMER_RETURN',
            quantity: r.quantity,
            unitCost: line.unitCost.toString(),
            reason: input.reason,
            referenceType: 'SALE',
            referenceId: sale.id,
          },
          settings,
        );
        if (!input.restock) {
          await this.engine.apply(
            tx,
            {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              productId: line.productId,
              warehouseId: sale.warehouseId,
              type: 'BLOCK',
              quantity: r.quantity,
              reason: 'DAMAGED',
              note: input.reason,
              referenceType: 'SALE',
              referenceId: sale.id,
            },
            settings,
          );
        }
        await tx.salesOrderLine.update({ where: { id: line.id }, data: { returnedQty: { increment: r.quantity } } });
      }

      // Refund: first cancel what the customer still owes on this sale, then pay back the rest.
      const outstanding = Decimal.max(d(sale.total.toString()).minus(d(sale.refundedTotal.toString())).minus(d(sale.paidTotal.toString())), 0);
      const reduceDebt = Decimal.min(outstanding, amount);
      const cashBack = amount.minus(reduceDebt);
      if (sale.customerId && reduceDebt.gt(0)) await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { decrement: reduceDebt.toFixed(3) } } });
      if (cashBack.gt(0)) {
        await tx.payment.create({
          data: { organizationId: ctx.organizationId, salesOrderId: id, method: input.refundMethod ?? 'CASH', amount: cashBack.negated().toFixed(3), isRefund: true, receivedById: ctx.userId },
        });
      }
      const updatedLines = await tx.salesOrderLine.findMany({ where: { salesOrderId: id } });
      const fully = updatedLines.every((l) => l.returnedQty.gte(l.quantity));
      const refunded = d(sale.refundedTotal.toString()).plus(amount);
      const paid = d(sale.paidTotal.toString()).minus(cashBack);
      await tx.salesOrder.update({
        where: { id },
        data: {
          status: fully ? 'RETURNED' : 'PARTIALLY_RETURNED',
          refundedTotal: refunded.toFixed(3),
          paidTotal: paid.toFixed(3),
          paymentStatus: paymentStatus(d(sale.total.toString()).minus(refunded), paid),
        },
      });
      const ret = await tx.customerReturn.create({
        data: {
          organizationId: ctx.organizationId,
          number: await this.seq.next(tx, ctx.organizationId, 'AV'),
          salesOrderId: id,
          reason: input.reason,
          restock: input.restock,
          amount: amount.toFixed(3),
          lines: input.lines as unknown as Prisma.InputJsonValue,
          createdById: ctx.userId,
        },
      });
      await this.audit.log(ctx, { action: 'sale.return', entityType: 'SalesOrder', entityId: id, data: { return: ret.number, amount: amount.toFixed(3), restock: input.restock } }, tx);
    });
    return this.get(ctx, id);
  }

  async cancel(ctx: TenantContext, id: string) {
    await this.prisma.tx(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sales_orders WHERE id = ${id}::uuid AND "organizationId" = ${ctx.organizationId}::uuid FOR UPDATE`;
      if (!rows.length) throw AppError.notFound();
      const sale = await tx.salesOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      if (sale.status !== 'COMPLETED') throw AppError.invalidState({ status: sale.status });
      const settings = await this.engine.orgSettings(tx, ctx.organizationId);
      for (const line of [...sale.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        await this.engine.apply(
          tx,
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            productId: line.productId,
            warehouseId: sale.warehouseId,
            type: 'SALE_REVERSAL',
            quantity: line.quantity.toString(),
            unitCost: line.unitCost.toString(),
            referenceType: 'SALE',
            referenceId: sale.id,
          },
          settings,
        );
      }
      const due = d(sale.total.toString()).minus(d(sale.paidTotal.toString()));
      if (sale.customerId && due.gt(0)) await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { decrement: due.toFixed(3) } } });
      if (d(sale.paidTotal.toString()).gt(0)) {
        await tx.payment.create({
          data: { organizationId: ctx.organizationId, salesOrderId: id, method: 'CASH', amount: d(sale.paidTotal.toString()).negated().toFixed(3), isRefund: true, receivedById: ctx.userId },
        });
      }
      await tx.salesOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), paidTotal: '0', refundedTotal: sale.total } });
      await this.audit.log(ctx, { action: 'sale.cancel', entityType: 'SalesOrder', entityId: id, data: { number: sale.number } }, tx);
    });
    return this.get(ctx, id);
  }

  async list(ctx: TenantContext, q: z.infer<typeof salesListQuery>) {
    const where: Prisma.SalesOrderWhereInput = {
      organizationId: ctx.organizationId,
      customerId: q.customerId,
      warehouseId: q.warehouseId,
      completedAt: q.from || q.to ? { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } : undefined,
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { customer: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        orderBy: { completedAt: q.order },
        ...pageArgs(q),
        include: { customer: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return paginated(
      items.map((s) => ({ ...s, margin: d(s.subtotal.toString()).minus(d(s.costTotal.toString())).toFixed(3) })),
      total,
      q,
    );
  }

  async get(ctx: TenantContext, id: string) {
    const s = await this.prisma.salesOrder.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { customer: true, lines: true, payments: { orderBy: { paidAt: 'asc' } }, returns: true },
    });
    if (!s) throw AppError.notFound();
    const products = await this.prisma.product.findMany({ where: { id: { in: s.lines.map((l) => l.productId) } }, select: { id: true, name: true, sku: true, baseUnit: true } });
    const pm = new Map(products.map((p) => [p.id, p]));
    const margin = d(s.subtotal.toString()).minus(d(s.costTotal.toString()));
    return {
      ...s,
      lines: s.lines.map((l) => ({ ...l, product: pm.get(l.productId), margin: d(l.netTotal.toString()).minus(d(l.costTotal.toString())).toFixed(3) })),
      margin: margin.toFixed(3),
      marginRate: d(s.subtotal.toString()).gt(0) ? margin.div(d(s.subtotal.toString())).times(100).toFixed(2) : null,
      due: Decimal.max(d(s.total.toString()).minus(d(s.refundedTotal.toString())).minus(d(s.paidTotal.toString())), 0).toFixed(3),
    };
  }

  /* ------------------------------ Customers ------------------------------ */

  async customers(ctx: TenantContext, q: z.infer<typeof paginationQuery>) {
    const where: Prisma.CustomerWhereInput = {
      organizationId: ctx.organizationId,
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: { name: 'asc' }, ...pageArgs(q), include: { _count: { select: { sales: true } } } }),
      this.prisma.customer.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  async customer(ctx: TenantContext, id: string) {
    const c = await this.prisma.customer.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { sales: { orderBy: { completedAt: 'desc' }, take: 20, select: { id: true, number: true, total: true, paymentStatus: true, status: true, completedAt: true } } },
    });
    if (!c) throw AppError.notFound();
    return c;
  }

  async createCustomer(ctx: TenantContext, input: z.infer<typeof customerSchema>, isDemo = false) {
    const c = await this.prisma.customer.create({ data: { ...input, organizationId: ctx.organizationId, isDemo } });
    await this.audit.log(ctx, { action: 'customer.create', entityType: 'Customer', entityId: c.id, data: { name: c.name } });
    return c;
  }

  async updateCustomer(ctx: TenantContext, id: string, input: z.infer<typeof customerSchema>) {
    const res = await this.prisma.customer.updateMany({ where: { id, organizationId: ctx.organizationId }, data: input });
    if (res.count !== 1) throw AppError.notFound();
    await this.audit.log(ctx, { action: 'customer.update', entityType: 'Customer', entityId: id, data: input });
    return this.prisma.customer.findUniqueOrThrow({ where: { id } });
  }
}

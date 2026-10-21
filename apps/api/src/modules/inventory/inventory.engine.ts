import { Injectable } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { COST_SCALE, d, Decimal, roundMoney, weightedAverageCost } from '@stockiteasy/shared';
import { AppError } from '../../common/errors';
import { Tx } from '../../prisma/prisma.service';

/**
 * Single entry point for every stock change.
 *
 * Guarantees
 * - Runs inside the caller's transaction: the document (sale, receipt, transfer…)
 *   and its stock movements commit or roll back together.
 * - Locks the product row then the balance row (SELECT … FOR UPDATE). Callers that
 *   touch several products must apply them sorted by (productId, warehouseId) so
 *   lock order is consistent and concurrent documents cannot deadlock.
 * - Refuses to let available stock go negative unless the organization allows it.
 * - Writes an append-only InventoryMovement for each change, with the balance after it.
 * - Maintains valuation: moving weighted average on the product, plus FIFO cost
 *   layers per warehouse (used for COGS when the organization is set to FIFO).
 * - Maintains lots for lot-tracked products and consumes them FEFO.
 */

const INBOUND_TYPES: MovementType[] = ['OPENING', 'RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'CUSTOMER_RETURN', 'SALE_REVERSAL'];
const OUTBOUND_TYPES: MovementType[] = ['SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'SUPPLIER_RETURN', 'RECEIPT_REVERSAL'];

export interface MovementRequest {
  organizationId: string;
  userId?: string | null;
  productId: string;
  warehouseId: string;
  type: MovementType;
  /** Always positive; the direction comes from `type` (COUNT_ADJUSTMENT uses `direction`). */
  quantity: Decimal.Value;
  direction?: 'IN' | 'OUT';
  /** Inbound: cost of the incoming goods. Defaults to the current average cost. */
  unitCost?: Decimal.Value | null;
  reason?: string | null;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  lotNumber?: string | null;
  expiryDate?: Date | null;
  /** Releases this quantity from reservations at the same time (sale of reserved goods). */
  consumeReserved?: Decimal.Value;
  occurredAt?: Date;
  /** FIFO layer source, so reversals can target the right layer. */
  costSource?: { type: string; id: string };
  /** Physical count corrections reflect reality and bypass the availability check. */
  skipAvailabilityCheck?: boolean;
}

export interface MovementResult {
  movementIds: string[];
  quantity: Decimal;
  unitCost: Decimal;
  totalCost: Decimal;
  balanceAfter: Decimal;
  availableAfter: Decimal;
}

interface LockedProduct {
  id: string;
  name: string;
  sku: string;
  averageCost: Prisma.Decimal;
  tracking: 'NONE' | 'LOT' | 'SERIAL';
  hasExpiry: boolean;
  minStock: Prisma.Decimal;
  status: string;
}

interface LockedBalance {
  id: string;
  quantityOnHand: Prisma.Decimal;
  quantityReserved: Prisma.Decimal;
  quantityBlocked: Prisma.Decimal;
}

interface OrgSettings {
  allowNegativeStock: boolean;
  valuationMethod: 'WEIGHTED_AVERAGE' | 'FIFO';
}

@Injectable()
export class InventoryEngine {
  async orgSettings(tx: Tx, organizationId: string): Promise<OrgSettings> {
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { allowNegativeStock: true, valuationMethod: true },
    });
    return org;
  }

  async lockProduct(tx: Tx, organizationId: string, productId: string): Promise<LockedProduct> {
    const rows = await tx.$queryRaw<LockedProduct[]>`
      SELECT id, name, sku, "averageCost", tracking::text AS tracking, "hasExpiry", "minStock", status::text AS status
      FROM products WHERE id = ${productId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    if (!rows[0]) throw AppError.notFound({ productId });
    return rows[0];
  }

  async lockBalance(tx: Tx, organizationId: string, productId: string, warehouseId: string): Promise<LockedBalance> {
    const wh = await tx.warehouse.findFirst({ where: { id: warehouseId, organizationId }, select: { isActive: true } });
    if (!wh) throw AppError.notFound({ warehouseId });
    if (!wh.isActive) throw new AppError('WAREHOUSE_INACTIVE', 409);
    await tx.$executeRaw`
      INSERT INTO inventory_balances (id, "organizationId", "productId", "warehouseId", "updatedAt")
      VALUES (gen_random_uuid(), ${organizationId}::uuid, ${productId}::uuid, ${warehouseId}::uuid, now())
      ON CONFLICT ("productId", "warehouseId") DO NOTHING`;
    const rows = await tx.$queryRaw<LockedBalance[]>`
      SELECT id, "quantityOnHand", "quantityReserved", "quantityBlocked"
      FROM inventory_balances WHERE "productId" = ${productId}::uuid AND "warehouseId" = ${warehouseId}::uuid FOR UPDATE`;
    return rows[0];
  }

  private available(b: { quantityOnHand: Decimal.Value; quantityReserved: Decimal.Value; quantityBlocked: Decimal.Value }) {
    return d(b.quantityOnHand).minus(d(b.quantityReserved)).minus(d(b.quantityBlocked));
  }

  async apply(tx: Tx, req: MovementRequest, settings?: OrgSettings): Promise<MovementResult> {
    const qty = d(req.quantity);
    if (qty.lte(0)) throw new AppError('VALIDATION_FAILED', 400, { quantity: 'positive' });
    const org = settings ?? (await this.orgSettings(tx, req.organizationId));
    const product = await this.lockProduct(tx, req.organizationId, req.productId);
    const balance = await this.lockBalance(tx, req.organizationId, req.productId, req.warehouseId);

    if (req.type === 'BLOCK' || req.type === 'UNBLOCK') return this.applyBlock(tx, req, product, balance, qty);

    let inbound: boolean;
    if (req.type === 'COUNT_ADJUSTMENT') {
      if (!req.direction) throw new AppError('VALIDATION_FAILED', 400, { direction: 'required' });
      inbound = req.direction === 'IN';
    } else if (INBOUND_TYPES.includes(req.type)) inbound = true;
    else if (OUTBOUND_TYPES.includes(req.type)) inbound = false;
    else throw new AppError('VALIDATION_FAILED', 400, { type: req.type });

    const consumeReserved = d(req.consumeReserved ?? 0);
    const availableBefore = this.available(balance);
    const occurredAt = req.occurredAt ?? new Date();

    let unitCost: Decimal;
    let totalCost: Decimal;

    if (inbound) {
      unitCost = req.unitCost === undefined || req.unitCost === null ? d(product.averageCost) : d(req.unitCost);
      totalCost = roundMoney(qty.times(unitCost));
      // Moving weighted average over the product's stock in all warehouses.
      const totalOnHand = await this.totalOnHand(tx, req.productId);
      const newAvg = weightedAverageCost(totalOnHand, product.averageCost.toString(), qty, unitCost);
      if (!newAvg.eq(d(product.averageCost))) {
        await tx.product.update({ where: { id: product.id }, data: { averageCost: newAvg.toFixed(COST_SCALE) } });
      }
      await tx.costLayer.create({
        data: {
          organizationId: req.organizationId,
          productId: req.productId,
          warehouseId: req.warehouseId,
          originalQty: qty.toFixed(3),
          remainingQty: qty.toFixed(3),
          unitCost: unitCost.toFixed(COST_SCALE),
          sourceType: req.costSource?.type ?? req.type,
          sourceId: req.costSource?.id ?? req.referenceId ?? null,
          receivedAt: occurredAt,
        },
      });
    } else {
      const availableForThis = availableBefore.plus(consumeReserved);
      if (!org.allowNegativeStock && !req.skipAvailabilityCheck && availableForThis.lt(qty)) {
        throw AppError.unprocessable('INSUFFICIENT_STOCK', {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          warehouseId: req.warehouseId,
          available: availableForThis.toFixed(3),
          requested: qty.toFixed(3),
        });
      }
      const fifo = await this.consumeLayers(tx, req, qty, d(product.averageCost));
      if (org.valuationMethod === 'FIFO') {
        totalCost = roundMoney(fifo);
        unitCost = totalCost.div(qty).toDecimalPlaces(COST_SCALE);
      } else {
        unitCost = req.type === 'RECEIPT_REVERSAL' && req.unitCost != null ? d(req.unitCost) : d(product.averageCost);
        totalCost = roundMoney(qty.times(unitCost));
      }
      if (req.type === 'RECEIPT_REVERSAL' && req.unitCost != null) {
        // Undo the receipt's contribution to the moving average.
        const totalOnHand = await this.totalOnHand(tx, req.productId);
        const remaining = totalOnHand.minus(qty);
        if (remaining.gt(0)) {
          const value = totalOnHand.times(d(product.averageCost)).minus(qty.times(d(req.unitCost)));
          const avg = Decimal.max(value.div(remaining), 0).toDecimalPlaces(COST_SCALE);
          await tx.product.update({ where: { id: product.id }, data: { averageCost: avg.toFixed(COST_SCALE) } });
        }
      }
    }

    const signed = inbound ? qty : qty.negated();
    const newOnHand = d(balance.quantityOnHand).plus(signed);
    const newReserved = Decimal.max(d(balance.quantityReserved).minus(consumeReserved), 0);
    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { quantityOnHand: newOnHand.toFixed(3), quantityReserved: newReserved.toFixed(3), version: { increment: 1 } },
    });

    const portions = await this.applyLots(tx, req, product, qty, inbound);
    const movementIds: string[] = [];
    let running = d(balance.quantityOnHand);
    for (const portion of portions) {
      running = running.plus(inbound ? portion.quantity : portion.quantity.negated());
      const portionCost = roundMoney(portion.quantity.times(unitCost));
      const m = await tx.inventoryMovement.create({
        data: {
          organizationId: req.organizationId,
          productId: req.productId,
          warehouseId: req.warehouseId,
          type: req.type,
          quantity: (inbound ? portion.quantity : portion.quantity.negated()).toFixed(3),
          unitCost: unitCost.toFixed(COST_SCALE),
          totalCost: (inbound ? portionCost : portionCost.negated()).toFixed(3),
          balanceAfter: running.toFixed(3),
          reason: req.reason ?? null,
          note: req.note ?? null,
          referenceType: req.referenceType ?? null,
          referenceId: req.referenceId ?? null,
          lotId: portion.lotId,
          userId: req.userId ?? null,
          occurredAt,
        },
        select: { id: true },
      });
      movementIds.push(m.id);
    }

    const availableAfter = newOnHand.minus(newReserved).minus(d(balance.quantityBlocked));
    await this.stockAlerts(tx, req, product, availableBefore, availableAfter);
    return { movementIds, quantity: qty, unitCost, totalCost, balanceAfter: newOnHand, availableAfter };
  }

  private async totalOnHand(tx: Tx, productId: string): Promise<Decimal> {
    const agg = await tx.inventoryBalance.aggregate({ where: { productId }, _sum: { quantityOnHand: true } });
    return d(agg._sum.quantityOnHand?.toString() ?? 0);
  }

  /** Consumes FIFO layers in the warehouse; returns the total cost of the consumed quantity. */
  private async consumeLayers(tx: Tx, req: MovementRequest, qty: Decimal, fallbackCost: Decimal): Promise<Decimal> {
    const layers = await tx.$queryRaw<{ id: string; remainingQty: Prisma.Decimal; unitCost: Prisma.Decimal; sourceId: string | null }[]>`
      SELECT id, "remainingQty", "unitCost", "sourceId" FROM cost_layers
      WHERE "productId" = ${req.productId}::uuid AND "warehouseId" = ${req.warehouseId}::uuid AND "remainingQty" > 0
      ORDER BY "receivedAt" ASC, id ASC FOR UPDATE`;
    // A receipt reversal removes its own layer first.
    if (req.type === 'RECEIPT_REVERSAL' && req.costSource) {
      layers.sort((a, b) => Number(b.sourceId === req.costSource!.id) - Number(a.sourceId === req.costSource!.id));
    }
    let remaining = qty;
    let cost = new Decimal(0);
    for (const layer of layers) {
      if (remaining.lte(0)) break;
      const take = Decimal.min(remaining, d(layer.remainingQty));
      cost = cost.plus(take.times(d(layer.unitCost)));
      remaining = remaining.minus(take);
      await tx.costLayer.update({ where: { id: layer.id }, data: { remainingQty: d(layer.remainingQty).minus(take).toFixed(3) } });
    }
    if (remaining.gt(0)) cost = cost.plus(remaining.times(fallbackCost));
    return cost;
  }

  /** Splits the movement by lot. Inbound lot products need a lot number; outbound ones are consumed FEFO. */
  private async applyLots(
    tx: Tx,
    req: MovementRequest,
    product: LockedProduct,
    qty: Decimal,
    inbound: boolean,
  ): Promise<{ lotId: string | null; quantity: Decimal }[]> {
    if (product.tracking !== 'LOT') return [{ lotId: null, quantity: qty }];
    if (inbound) {
      const lotNumber = req.lotNumber?.trim() || (req.type === 'TRANSFER_IN' || req.type === 'CUSTOMER_RETURN' || req.type === 'SALE_REVERSAL' ? 'UNSPECIFIED' : '');
      if (!lotNumber) throw new AppError('LOT_REQUIRED', 400, { productId: product.id });
      if (product.hasExpiry && !req.expiryDate && ['RECEIPT', 'OPENING'].includes(req.type)) {
        throw new AppError('EXPIRY_REQUIRED', 400, { productId: product.id });
      }
      const lot = await tx.inventoryLot.upsert({
        where: { productId_warehouseId_lotNumber: { productId: req.productId, warehouseId: req.warehouseId, lotNumber } },
        create: {
          organizationId: req.organizationId,
          productId: req.productId,
          warehouseId: req.warehouseId,
          lotNumber,
          expiryDate: req.expiryDate ?? null,
          quantity: qty.toFixed(3),
        },
        update: { quantity: { increment: qty.toFixed(3) }, ...(req.expiryDate ? { expiryDate: req.expiryDate } : {}) },
      });
      return [{ lotId: lot.id, quantity: qty }];
    }
    const lots = await tx.$queryRaw<{ id: string; quantity: Prisma.Decimal; lotNumber: string }[]>`
      SELECT id, quantity, "lotNumber" FROM inventory_lots
      WHERE "productId" = ${req.productId}::uuid AND "warehouseId" = ${req.warehouseId}::uuid AND quantity > 0
      ORDER BY "expiryDate" ASC NULLS LAST, "receivedAt" ASC FOR UPDATE`;
    if (req.lotNumber) lots.sort((a, b) => Number(b.lotNumber === req.lotNumber) - Number(a.lotNumber === req.lotNumber));
    const portions: { lotId: string | null; quantity: Decimal }[] = [];
    let remaining = qty;
    for (const lot of lots) {
      if (remaining.lte(0)) break;
      const take = Decimal.min(remaining, d(lot.quantity));
      await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantity: d(lot.quantity).minus(take).toFixed(3) } });
      portions.push({ lotId: lot.id, quantity: take });
      remaining = remaining.minus(take);
    }
    if (remaining.gt(0)) portions.push({ lotId: null, quantity: remaining });
    return portions;
  }

  private async applyBlock(tx: Tx, req: MovementRequest, product: LockedProduct, balance: LockedBalance, qty: Decimal): Promise<MovementResult> {
    const blocked = d(balance.quantityBlocked);
    const availableBefore = this.available(balance);
    let newBlocked: Decimal;
    if (req.type === 'BLOCK') {
      if (availableBefore.lt(qty)) {
        throw AppError.unprocessable('INSUFFICIENT_STOCK', { productId: product.id, available: availableBefore.toFixed(3), requested: qty.toFixed(3) });
      }
      newBlocked = blocked.plus(qty);
    } else {
      if (blocked.lt(qty)) throw AppError.unprocessable('INSUFFICIENT_STOCK', { productId: product.id, blocked: blocked.toFixed(3) });
      newBlocked = blocked.minus(qty);
    }
    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { quantityBlocked: newBlocked.toFixed(3), version: { increment: 1 } },
    });
    const m = await tx.inventoryMovement.create({
      data: {
        organizationId: req.organizationId,
        productId: req.productId,
        warehouseId: req.warehouseId,
        type: req.type,
        quantity: (req.type === 'BLOCK' ? qty.negated() : qty).toFixed(3),
        unitCost: d(product.averageCost).toFixed(COST_SCALE),
        totalCost: '0',
        balanceAfter: d(balance.quantityOnHand).toFixed(3),
        reason: req.reason ?? null,
        note: req.note ?? null,
        referenceType: req.referenceType ?? null,
        referenceId: req.referenceId ?? null,
        userId: req.userId ?? null,
        occurredAt: req.occurredAt ?? new Date(),
      },
      select: { id: true },
    });
    const availableAfter = d(balance.quantityOnHand).minus(d(balance.quantityReserved)).minus(newBlocked);
    await this.stockAlerts(tx, req, product, availableBefore, availableAfter);
    return {
      movementIds: [m.id],
      quantity: qty,
      unitCost: d(product.averageCost),
      totalCost: new Decimal(0),
      balanceAfter: d(balance.quantityOnHand),
      availableAfter,
    };
  }

  /** Reserve / release available stock (orders awaiting delivery). */
  async reserve(tx: Tx, organizationId: string, productId: string, warehouseId: string, quantity: Decimal.Value, release = false) {
    const qty = d(quantity);
    const org = await this.orgSettings(tx, organizationId);
    const product = await this.lockProduct(tx, organizationId, productId);
    const balance = await this.lockBalance(tx, organizationId, productId, warehouseId);
    const available = this.available(balance);
    if (!release && !org.allowNegativeStock && available.lt(qty)) {
      throw AppError.unprocessable('INSUFFICIENT_STOCK', { productId, available: available.toFixed(3), requested: qty.toFixed(3) });
    }
    const reserved = release ? Decimal.max(d(balance.quantityReserved).minus(qty), 0) : d(balance.quantityReserved).plus(qty);
    await tx.inventoryBalance.update({ where: { id: balance.id }, data: { quantityReserved: reserved.toFixed(3), version: { increment: 1 } } });
    const after = d(balance.quantityOnHand).minus(reserved).minus(d(balance.quantityBlocked));
    await this.stockAlerts(tx, { organizationId, productId, warehouseId } as MovementRequest, product, available, after);
    return after;
  }

  /**
   * In-app alerts when available stock crosses the minimum or reaches zero.
   * The dedupe key stays set while the condition holds, so the same alert is
   * never raised twice; it is released once stock recovers.
   */
  private async stockAlerts(tx: Tx, req: Pick<MovementRequest, 'organizationId' | 'productId' | 'warehouseId'>, product: LockedProduct, before: Decimal, after: Decimal) {
    const min = d(product.minStock);
    const lowKey = `LOW_STOCK:${req.productId}:${req.warehouseId}`;
    const outKey = `OUT_OF_STOCK:${req.productId}:${req.warehouseId}`;
    const warehouse = await tx.warehouse.findUnique({ where: { id: req.warehouseId }, select: { name: true } });
    const params = { product: product.name, sku: product.sku, warehouse: warehouse?.name ?? '', available: after.toFixed(3), min: min.toFixed(3) };
    const link = `/products/${req.productId}`;

    if (after.lte(0) && before.gt(0)) {
      await tx.notification.upsert({
        where: { organizationId_dedupeKey: { organizationId: req.organizationId, dedupeKey: outKey } },
        create: { organizationId: req.organizationId, type: 'OUT_OF_STOCK', params, link, dedupeKey: outKey },
        update: {},
      });
    } else if (min.gt(0) && after.lt(min) && after.gt(0) && before.gte(min)) {
      await tx.notification.upsert({
        where: { organizationId_dedupeKey: { organizationId: req.organizationId, dedupeKey: lowKey } },
        create: { organizationId: req.organizationId, type: 'LOW_STOCK', params, link, dedupeKey: lowKey },
        update: {},
      });
    }
    if (after.gt(0)) {
      await tx.notification.updateMany({ where: { organizationId: req.organizationId, dedupeKey: outKey }, data: { dedupeKey: null } });
    }
    if (after.gte(min)) {
      await tx.notification.updateMany({ where: { organizationId: req.organizationId, dedupeKey: lowKey }, data: { dedupeKey: null } });
    }
  }
}

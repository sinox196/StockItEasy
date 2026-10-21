import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { adjustmentSchema, blockStockSchema, d, movementListQuery, reservationSchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { pageArgs, paginated } from '../../common/pagination';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { InventoryEngine } from './inventory.engine';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: InventoryEngine,
    private readonly audit: AuditService,
  ) {}

  /** Manual adjustment with a mandatory reason. */
  async adjust(ctx: TenantContext, input: z.infer<typeof adjustmentSchema>, tx?: Tx, occurredAt?: Date) {
    const run = async (t: Tx) => {
      const product = await t.product.findFirst({ where: { id: input.productId, organizationId: ctx.organizationId } });
      if (!product) throw AppError.notFound({ productId: input.productId });
      const result = await this.engine.apply(t, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        type: input.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        quantity: input.quantity,
        unitCost: input.direction === 'IN' ? input.unitCost : undefined,
        reason: input.reason,
        note: input.note,
        referenceType: 'MANUAL',
        lotNumber: input.lotNumber,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        occurredAt,
      });
      await this.audit.log(
        ctx,
        {
          action: 'inventory.adjust',
          entityType: 'Product',
          entityId: input.productId,
          data: { warehouseId: input.warehouseId, direction: input.direction, quantity: input.quantity, reason: input.reason, note: input.note },
        },
        t,
      );
      return { movementIds: result.movementIds, balanceAfter: result.balanceAfter.toFixed(3), availableAfter: result.availableAfter.toFixed(3) };
    };
    return tx ? run(tx) : this.prisma.tx(run);
  }

  async block(ctx: TenantContext, input: z.infer<typeof blockStockSchema>) {
    return this.prisma.tx(async (tx) => {
      const result = await this.engine.apply(tx, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        type: input.action,
        quantity: input.quantity,
        reason: input.reason,
        note: input.note,
        referenceType: 'MANUAL',
      });
      await this.audit.log(ctx, { action: `inventory.${input.action.toLowerCase()}`, entityType: 'Product', entityId: input.productId, data: input }, tx);
      return { availableAfter: result.availableAfter.toFixed(3) };
    });
  }

  async reserve(ctx: TenantContext, input: z.infer<typeof reservationSchema>) {
    return this.prisma.tx(async (tx) => {
      await this.engine.reserve(tx, ctx.organizationId, input.productId, input.warehouseId, input.quantity);
      const r = await tx.inventoryReservation.create({
        data: {
          organizationId: ctx.organizationId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          reference: input.reference,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdById: ctx.userId,
        },
      });
      await this.audit.log(ctx, { action: 'inventory.reserve', entityType: 'InventoryReservation', entityId: r.id, data: input }, tx);
      return r;
    });
  }

  async releaseReservation(ctx: TenantContext, id: string) {
    return this.prisma.tx(async (tx) => {
      const r = await tx.inventoryReservation.findFirst({ where: { id, organizationId: ctx.organizationId } });
      if (!r) throw AppError.notFound();
      const res = await tx.inventoryReservation.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'RELEASED', releasedAt: new Date() } });
      if (res.count !== 1) throw AppError.invalidState();
      await this.engine.reserve(tx, ctx.organizationId, r.productId, r.warehouseId, r.quantity.toString(), true);
      await this.audit.log(ctx, { action: 'inventory.release', entityType: 'InventoryReservation', entityId: id }, tx);
      return { ...r, status: 'RELEASED' };
    });
  }

  listReservations(ctx: TenantContext) {
    return this.prisma.inventoryReservation.findMany({
      where: { organizationId: ctx.organizationId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async movements(ctx: TenantContext, q: z.infer<typeof movementListQuery>) {
    const where: Prisma.InventoryMovementWhereInput = {
      organizationId: ctx.organizationId,
      productId: q.productId,
      warehouseId: q.warehouseId,
      type: q.type,
      occurredAt: q.from || q.to ? { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } : undefined,
    };
    if (q.search) {
      where.OR = [{ note: { contains: q.search, mode: 'insensitive' } }];
      const products = await this.prisma.product.findMany({
        where: {
          organizationId: ctx.organizationId,
          OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { sku: { contains: q.search, mode: 'insensitive' } }],
        },
        select: { id: true },
        take: 200,
      });
      where.OR.push({ productId: { in: products.map((p) => p.id) } });
    }
    const [items, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({ where, orderBy: { occurredAt: q.order }, ...pageArgs(q) }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    const productIds = [...new Set(items.map((m) => m.productId))];
    const warehouseIds = [...new Set(items.map((m) => m.warehouseId))];
    const userIds = [...new Set(items.map((m) => m.userId).filter((x): x is string => !!x))];
    const [products, warehouses, users] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true, baseUnit: true } }),
      this.prisma.warehouse.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, name: true, code: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }),
    ]);
    const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const pm = byId(products);
    const wm = byId(warehouses);
    const um = byId(users);
    return paginated(
      items.map((m) => ({ ...m, product: pm.get(m.productId), warehouse: wm.get(m.warehouseId), user: m.userId ? um.get(m.userId) : null })),
      total,
      q,
    );
  }

  /** Balances of a product across warehouses, or of a warehouse across products. */
  async balances(ctx: TenantContext, filter: { productId?: string; warehouseId?: string }) {
    const rows = await this.prisma.inventoryBalance.findMany({
      where: { organizationId: ctx.organizationId, productId: filter.productId, warehouseId: filter.warehouseId },
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, sku: true, averageCost: true, minStock: true, baseUnit: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
    return rows.map((b) => {
      const available = d(b.quantityOnHand.toString()).minus(d(b.quantityReserved.toString())).minus(d(b.quantityBlocked.toString()));
      return {
        ...b,
        quantityAvailable: available.toFixed(3),
        value: d(b.quantityOnHand.toString()).times(d(b.product.averageCost.toString())).toFixed(3),
      };
    });
  }

  async lots(ctx: TenantContext, productId: string) {
    return this.prisma.inventoryLot.findMany({
      where: { organizationId: ctx.organizationId, productId, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });
  }
}

import { Injectable } from '@nestjs/common';
import { d, locationSchema, storeSchema, warehouseSchema } from '@stockiteasy/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgs: OrganizationsService,
  ) {}

  stores(ctx: TenantContext) {
    return this.prisma.store.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: 'asc' } });
  }

  async createStore(ctx: TenantContext, input: z.infer<typeof storeSchema>) {
    const s = await this.prisma.store.create({ data: { ...input, organizationId: ctx.organizationId } });
    await this.audit.log(ctx, { action: 'store.create', entityType: 'Store', entityId: s.id, data: input });
    return s;
  }

  async updateStore(ctx: TenantContext, id: string, input: z.infer<typeof storeSchema>) {
    const res = await this.prisma.store.updateMany({ where: { id, organizationId: ctx.organizationId }, data: input });
    if (res.count !== 1) throw AppError.notFound();
    await this.audit.log(ctx, { action: 'store.update', entityType: 'Store', entityId: id, data: input });
    return this.prisma.store.findUniqueOrThrow({ where: { id } });
  }

  /** Warehouses with valuation (on-hand × average cost) and product counts. */
  async list(ctx: TenantContext) {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { organizationId: ctx.organizationId },
      include: { store: { select: { id: true, name: true } }, _count: { select: { locations: true } } },
      orderBy: { name: 'asc' },
    });
    const values = await this.prisma.$queryRaw<{ warehouseId: string; value: string; products: bigint; units: string }[]>`
      SELECT b."warehouseId", COALESCE(SUM(b."quantityOnHand" * p."averageCost"), 0)::text AS value,
             COUNT(*) FILTER (WHERE b."quantityOnHand" <> 0) AS products, COALESCE(SUM(b."quantityOnHand"), 0)::text AS units
      FROM inventory_balances b JOIN products p ON p.id = b."productId"
      WHERE b."organizationId" = ${ctx.organizationId}::uuid
      GROUP BY b."warehouseId"`;
    const map = new Map(values.map((v) => [v.warehouseId, v]));
    return warehouses.map((w) => ({
      ...w,
      stockValue: d(map.get(w.id)?.value ?? 0).toFixed(3),
      productsInStock: Number(map.get(w.id)?.products ?? 0),
      units: d(map.get(w.id)?.units ?? 0).toFixed(3),
    }));
  }

  async create(ctx: TenantContext, input: z.infer<typeof warehouseSchema>) {
    await this.orgs.assertQuota(ctx.organizationId, 'warehouses');
    if (input.storeId && !(await this.prisma.store.findFirst({ where: { id: input.storeId, organizationId: ctx.organizationId } }))) {
      throw AppError.notFound({ storeId: input.storeId });
    }
    const w = await this.prisma.warehouse.create({ data: { ...input, organizationId: ctx.organizationId } });
    await this.audit.log(ctx, { action: 'warehouse.create', entityType: 'Warehouse', entityId: w.id, data: input });
    return w;
  }

  async update(ctx: TenantContext, id: string, input: z.infer<typeof warehouseSchema>) {
    if (input.storeId && !(await this.prisma.store.findFirst({ where: { id: input.storeId, organizationId: ctx.organizationId } }))) {
      throw AppError.notFound({ storeId: input.storeId });
    }
    const res = await this.prisma.warehouse.updateMany({ where: { id, organizationId: ctx.organizationId }, data: input });
    if (res.count !== 1) throw AppError.notFound();
    await this.audit.log(ctx, { action: 'warehouse.update', entityType: 'Warehouse', entityId: id, data: input });
    return this.prisma.warehouse.findUniqueOrThrow({ where: { id } });
  }

  async locations(ctx: TenantContext, warehouseId: string) {
    await this.assertWarehouse(ctx, warehouseId);
    return this.prisma.location.findMany({ where: { warehouseId, organizationId: ctx.organizationId }, orderBy: { code: 'asc' } });
  }

  async createLocation(ctx: TenantContext, warehouseId: string, input: z.infer<typeof locationSchema>) {
    await this.assertWarehouse(ctx, warehouseId);
    const l = await this.prisma.location.create({ data: { ...input, warehouseId, organizationId: ctx.organizationId } });
    await this.audit.log(ctx, { action: 'location.create', entityType: 'Location', entityId: l.id, data: input });
    return l;
  }

  private async assertWarehouse(ctx: TenantContext, id: string) {
    const w = await this.prisma.warehouse.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!w) throw AppError.notFound();
    return w;
  }
}

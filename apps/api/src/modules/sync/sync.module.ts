import { Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { syncAdjustmentPayload, syncCountPayload, SyncPushInput, syncPushSchema } from '@stockiteasy/shared';
import { Ctx, RequirePermission, TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { ApiZodBody, ZBody } from '../../common/zod';
import { PrismaService } from '../../prisma/prisma.service';
import { CountsModule } from '../counts/counts.module';
import { CountsService } from '../counts/counts.service';
import { InventoryService } from '../inventory/inventory.service';

type OpResult = { clientOpId: string; status: 'APPLIED' | 'CONFLICT' | 'REJECTED' | 'DUPLICATE'; result?: unknown; error?: { code: string; details?: unknown } };

/**
 * Offline sync for the mobile app.
 * - Each operation carries a client-generated id; replays return the stored outcome (never applied twice).
 * - Operations are applied in client order, each in its own transaction, so one rejection does not block the rest.
 * - Conflicts are reported, never resolved silently: the device shows both values and the user decides.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly counts: CountsService,
    private readonly inventory: InventoryService,
  ) {}

  async push(ctx: TenantContext, input: SyncPushInput): Promise<{ results: OpResult[]; serverTime: string }> {
    const results: OpResult[] = [];
    const ordered = [...input.operations].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const op of ordered) {
      const existing = await this.prisma.syncOperation.findUnique({ where: { organizationId_clientOpId: { organizationId: ctx.organizationId, clientOpId: op.clientOpId } } });
      if (existing) {
        results.push({ clientOpId: op.clientOpId, status: 'DUPLICATE', result: existing.result ?? undefined });
        continue;
      }
      let outcome: OpResult;
      try {
        outcome = await this.prisma.tx(async (tx) => {
          let status: OpResult['status'];
          let result: unknown;
          if (op.type === 'STOCK_COUNT_LINE') {
            if (!ctx.permissions.includes('stock_counts.update')) throw AppError.forbidden();
            const p = syncCountPayload.parse(op.payload);
            const r = await this.counts.recordLine(ctx, p.countId, { productId: p.productId, countedQty: p.countedQty, mode: p.mode, countedAt: op.createdAt }, { tx, baseVersion: op.baseVersion });
            status = r.status;
            result = r.line;
          } else {
            if (!ctx.permissions.includes('inventory.create')) throw AppError.forbidden();
            const p = syncAdjustmentPayload.parse(op.payload);
            result = await this.inventory.adjust(ctx, p, tx, new Date(op.createdAt));
            status = 'APPLIED';
          }
          await tx.syncOperation.create({
            data: {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              deviceId: input.deviceId,
              clientOpId: op.clientOpId,
              type: op.type,
              payload: op.payload as Prisma.InputJsonValue,
              status,
              result: (result ?? null) as Prisma.InputJsonValue,
              clientCreatedAt: new Date(op.createdAt),
            },
          });
          return { clientOpId: op.clientOpId, status, result };
        });
      } catch (e) {
        const code = e instanceof AppError ? e.code : e instanceof Error && e.name === 'ZodError' ? 'VALIDATION_FAILED' : 'UNKNOWN';
        const details = e instanceof AppError ? e.details : undefined;
        await this.prisma.syncOperation
          .create({
            data: {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              deviceId: input.deviceId,
              clientOpId: op.clientOpId,
              type: op.type,
              payload: op.payload as Prisma.InputJsonValue,
              status: 'REJECTED',
              result: { code, details: (details ?? null) as Prisma.InputJsonValue } as Prisma.InputJsonValue,
              clientCreatedAt: new Date(op.createdAt),
            },
          })
          .catch(() => undefined);
        outcome = { clientOpId: op.clientOpId, status: 'REJECTED', error: { code, details } };
      }
      results.push(outcome);
    }
    return { results, serverTime: new Date().toISOString() };
  }

  /** Data a device needs to work offline: open counts with expected quantities and the catalogue for scanning. */
  async snapshot(ctx: TenantContext, warehouseId?: string) {
    const [products, counts, warehouses] = await Promise.all([
      this.prisma.product.findMany({
        where: { organizationId: ctx.organizationId, status: 'ACTIVE' },
        select: {
          id: true,
          sku: true,
          name: true,
          baseUnit: true,
          allowFractionalQty: true,
          salePrice: true,
          taxRate: true,
          minStock: true,
          updatedAt: true,
          barcodes: { select: { code: true, unitCode: true } },
          conversions: { select: { unitCode: true, factor: true } },
          balances: { where: warehouseId ? { warehouseId } : undefined, select: { warehouseId: true, quantityOnHand: true, quantityReserved: true, quantityBlocked: true, version: true } },
        },
        take: 20000,
      }),
      this.prisma.physicalInventory.findMany({
        where: { organizationId: ctx.organizationId, status: 'IN_PROGRESS', warehouseId },
        include: { lines: { select: { id: true, productId: true, expectedQty: true, countedQty: true, version: true } } },
      }),
      this.prisma.warehouse.findMany({ where: { organizationId: ctx.organizationId, isActive: true }, select: { id: true, name: true, code: true } }),
    ]);
    return { serverTime: new Date().toISOString(), warehouses, products, counts };
  }
}

@ApiTags('sync')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @RequirePermission('inventory.read')
  @ApiZodBody(syncPushSchema)
  push(@Ctx() ctx: TenantContext, @ZBody(syncPushSchema) body: SyncPushInput) {
    return this.sync.push(ctx, body);
  }

  @Get('snapshot')
  @RequirePermission('inventory.read')
  snapshot(@Ctx() ctx: TenantContext, @Query('warehouseId') warehouseId?: string) {
    return this.sync.snapshot(ctx, warehouseId);
  }
}

@Module({ imports: [CountsModule], controllers: [SyncController], providers: [SyncService] })
export class SyncModule {}

import { z } from 'zod';
import { ADJUSTMENT_REASONS, COUNT_SCOPES, MOVEMENT_TYPES, SYNC_OPERATION_TYPES } from '../domain/enums';
import { nonNegativeDecimal, paginationQuery, positiveDecimal, uuid } from './common';

export const storeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(1).max(20).toUpperCase(),
  city: z.string().trim().max(80).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
});

export const warehouseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(1).max(20).toUpperCase(),
  storeId: uuid.optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const locationSchema = z.object({
  code: z.string().trim().min(1).max(40).toUpperCase(),
  zone: z.string().trim().max(40).optional().nullable(),
  aisle: z.string().trim().max(40).optional().nullable(),
  shelf: z.string().trim().max(40).optional().nullable(),
  bin: z.string().trim().max(40).optional().nullable(),
});

export const adjustmentSchema = z.object({
  productId: uuid,
  warehouseId: uuid,
  direction: z.enum(['IN', 'OUT']),
  quantity: positiveDecimal,
  reason: z.enum(ADJUSTMENT_REASONS),
  note: z.string().max(500).optional(),
  unitCost: nonNegativeDecimal.optional(),
  lotNumber: z.string().trim().max(60).optional(),
  expiryDate: z.string().date().optional(),
});
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const blockStockSchema = z.object({
  productId: uuid,
  warehouseId: uuid,
  quantity: positiveDecimal,
  action: z.enum(['BLOCK', 'UNBLOCK']),
  reason: z.enum(ADJUSTMENT_REASONS),
  note: z.string().max(500).optional(),
});

export const reservationSchema = z.object({
  productId: uuid,
  warehouseId: uuid,
  quantity: positiveDecimal,
  reference: z.string().max(120).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const movementListQuery = paginationQuery.extend({
  productId: uuid.optional(),
  warehouseId: uuid.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const transferSchema = z
  .object({
    fromWarehouseId: uuid,
    toWarehouseId: uuid,
    note: z.string().max(500).optional(),
    lines: z.array(z.object({ productId: uuid, quantity: positiveDecimal })).min(1).max(500),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, { message: 'validation.sameWarehouse', path: ['toWarehouseId'] });

export const receiveTransferSchema = z.object({
  lines: z.array(z.object({ lineId: uuid, quantityReceived: nonNegativeDecimal })).min(1),
  note: z.string().max(500).optional(),
});

export const createCountSchema = z.object({
  warehouseId: uuid,
  scope: z.enum(COUNT_SCOPES).default('PARTIAL'),
  productIds: z.array(uuid).max(5000).optional(),
  categoryId: uuid.optional(),
  note: z.string().max(500).optional(),
});

export const countLineSchema = z.object({
  productId: uuid,
  countedQty: nonNegativeDecimal,
  /** When the count happened on the device (offline counts sync later). */
  countedAt: z.string().datetime().optional(),
  /** "replace" (default) sets the counted quantity, "add" accumulates scans. */
  mode: z.enum(['replace', 'add']).default('replace'),
});

export const syncOperationSchema = z.object({
  clientOpId: z.string().min(8).max(100),
  type: z.enum(SYNC_OPERATION_TYPES),
  createdAt: z.string().datetime(),
  /** Server state the device last saw; used to detect conflicts. */
  baseVersion: z.number().int().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const syncPushSchema = z.object({
  deviceId: z.string().min(4).max(100),
  operations: z.array(syncOperationSchema).min(1).max(500),
});
export type SyncPushInput = z.infer<typeof syncPushSchema>;

export const syncCountPayload = z.object({
  countId: uuid,
  productId: uuid,
  countedQty: nonNegativeDecimal,
  mode: z.enum(['replace', 'add']).default('replace'),
});

export const syncAdjustmentPayload = adjustmentSchema;

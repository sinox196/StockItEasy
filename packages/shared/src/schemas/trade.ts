import { z } from 'zod';
import { PAYMENT_METHODS, PO_STATUSES, SALES_CHANNELS } from '../domain/enums';
import { decimalString, nonNegativeDecimal, paginationQuery, positiveDecimal, uuid } from './common';

const taxRate = decimalString.refine((v) => Number(v) >= 0 && Number(v) <= 100, { message: 'validation.taxRate' });
const discountRate = decimalString.refine((v) => Number(v) >= 0 && Number(v) <= 100, { message: 'validation.discount' });

/* ----------------------------- Suppliers ----------------------------- */

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().max(30).optional().nullable(),
  contactName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
  address: z.string().trim().max(240).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  taxId: z.string().trim().max(40).optional().nullable(),
  paymentTermsDays: z.number().int().min(0).max(365).default(0),
  leadTimeDays: z.number().int().min(0).max(365).default(7),
  minOrderAmount: nonNegativeDecimal.optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const supplierProductSchema = z.object({
  productId: uuid,
  supplierSku: z.string().trim().max(64).optional().nullable(),
  unitPrice: nonNegativeDecimal,
  minOrderQty: nonNegativeDecimal.optional().nullable(),
  packSize: positiveDecimal.optional().nullable(),
  leadTimeDays: z.number().int().min(0).max(365).optional().nullable(),
  isPreferred: z.boolean().default(false),
});

/* --------------------------- Purchase orders -------------------------- */

export const purchaseOrderLineInput = z.object({
  productId: uuid,
  quantity: positiveDecimal,
  unitPrice: nonNegativeDecimal,
  taxRate: taxRate.optional(),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: uuid,
  warehouseId: uuid,
  expectedDate: z.string().date().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(purchaseOrderLineInput).min(1).max(500),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const updatePurchaseOrderSchema = createPurchaseOrderSchema.partial();

export const purchaseOrderListQuery = paginationQuery.extend({
  status: z.enum(PO_STATUSES).optional(),
  supplierId: uuid.optional(),
});

export const receiveGoodsSchema = z.object({
  warehouseId: uuid.optional(),
  note: z.string().max(1000).optional(),
  lines: z
    .array(
      z.object({
        lineId: uuid,
        quantity: positiveDecimal,
        unitCost: nonNegativeDecimal.optional(),
        lotNumber: z.string().trim().max(60).optional(),
        expiryDate: z.string().date().optional(),
        discrepancyReason: z.string().max(240).optional(),
      }),
    )
    .min(1),
});
export type ReceiveGoodsInput = z.infer<typeof receiveGoodsSchema>;

/* -------------------------------- Sales ------------------------------- */

export const customerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
  address: z.string().trim().max(240).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  taxId: z.string().trim().max(40).optional().nullable(),
  creditLimit: nonNegativeDecimal.optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const saleLineInput = z.object({
  productId: uuid,
  quantity: positiveDecimal,
  /** Defaults to the product sale price; overriding requires sales.approve when under the minimum price. */
  unitPrice: nonNegativeDecimal.optional(),
  discountRate: discountRate.optional(),
});

export const paymentInput = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: nonNegativeDecimal,
  reference: z.string().max(120).optional(),
});

export const createSaleSchema = z.object({
  warehouseId: uuid,
  customerId: uuid.optional().nullable(),
  channel: z.enum(SALES_CHANNELS).default('POS'),
  lines: z.array(saleLineInput).min(1).max(500),
  payments: z.array(paymentInput).max(5).default([]),
  note: z.string().max(1000).optional(),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const addPaymentSchema = paymentInput;

export const customerReturnSchema = z.object({
  reason: z.string().trim().min(2).max(240),
  /** Returned goods in sellable condition go back to available stock; others are blocked for inspection. */
  restock: z.boolean().default(true),
  lines: z.array(z.object({ lineId: uuid, quantity: positiveDecimal })).min(1),
  refundMethod: z.enum(PAYMENT_METHODS).optional(),
});

export const salesListQuery = paginationQuery.extend({
  customerId: uuid.optional(),
  warehouseId: uuid.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/* ------------------------------ Autopilot ----------------------------- */

export const decideRecommendationSchema = z.object({
  decision: z.enum(['APPROVE', 'MODIFY', 'REJECT']),
  quantity: positiveDecimal.optional(),
  supplierId: uuid.optional(),
  reason: z.string().max(500).optional(),
});

export const budgetSimulationSchema = z.object({
  budget: nonNegativeDecimal,
  recommendationIds: z.array(uuid).optional(),
});

export const dashboardQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  warehouseId: uuid.optional(),
  categoryId: uuid.optional(),
});

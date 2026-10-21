import { z } from 'zod';
import { PRODUCT_STATUSES, PRODUCT_TRACKING } from '../domain/enums';
import { decimalString, nonNegativeDecimal, paginationQuery, positiveDecimal, uuid } from './common';

export const skuSchema = z
  .string()
  .trim()
  .min(1, { message: 'validation.required' })
  .max(64)
  .regex(/^[A-Za-z0-9._\-/]+$/, { message: 'validation.sku' })
  .transform((v) => v.toUpperCase());

export const barcodeSchema = z
  .string()
  .trim()
  .min(4, { message: 'validation.barcode' })
  .max(64)
  .regex(/^[A-Za-z0-9\-.]+$/, { message: 'validation.barcode' });

export const unitConversionInput = z.object({
  unitCode: z.string().trim().min(1).max(20),
  factor: positiveDecimal,
  barcode: barcodeSchema.optional(),
});

const productBase = z.object({
  name: z.string().trim().min(2, { message: 'validation.required' }).max(200),
  sku: skuSchema,
  description: z.string().max(4000).optional().nullable(),
  categoryId: uuid.optional().nullable(),
  brand: z.string().trim().max(80).optional().nullable(),
  baseUnit: z.string().trim().min(1).max(20).default('pc'),
  allowFractionalQty: z.boolean().default(false),
  tracking: z.enum(PRODUCT_TRACKING).default('NONE'),
  hasExpiry: z.boolean().default(false),
  purchasePrice: nonNegativeDecimal.default('0'),
  salePrice: nonNegativeDecimal.default('0'),
  minSalePrice: nonNegativeDecimal.optional().nullable(),
  taxRate: decimalString.refine((v) => Number(v) >= 0 && Number(v) <= 100, { message: 'validation.taxRate' }).default('19'),
  minStock: nonNegativeDecimal.default('0'),
  maxStock: nonNegativeDecimal.optional().nullable(),
  preferredSupplierId: uuid.optional().nullable(),
  parentId: uuid.optional().nullable(),
  variantAttributes: z.record(z.string(), z.string().max(60)).optional().nullable(),
  status: z.enum(PRODUCT_STATUSES).default('ACTIVE'),
  barcodes: z.array(barcodeSchema).max(20).default([]),
  conversions: z.array(unitConversionInput).max(10).default([]),
  imageUrls: z.array(z.string().url()).max(10).default([]),
});

export const createProductSchema = productBase.extend({
  /** Optional opening stock, recorded as an OPENING movement. */
  openingStock: z
    .object({ warehouseId: uuid, quantity: positiveDecimal, unitCost: nonNegativeDecimal.optional() })
    .optional(),
  generateBarcode: z.boolean().default(false),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = productBase.partial().extend({
  /** Optimistic concurrency token returned by the API. */
  version: z.number().int().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productListQuery = paginationQuery.extend({
  categoryId: uuid.optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  stockState: z.enum(['LOW', 'OUT', 'OK']).optional(),
  warehouseId: uuid.optional(),
  supplierId: uuid.optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: uuid.optional().nullable(),
});

export const productImportRow = z.object({
  sku: skuSchema,
  name: z.string().trim().min(2).max(200),
  barcode: barcodeSchema.optional(),
  category: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(80).optional(),
  baseUnit: z.string().trim().max(20).optional(),
  purchasePrice: nonNegativeDecimal.optional(),
  salePrice: nonNegativeDecimal.optional(),
  taxRate: decimalString.optional(),
  minStock: nonNegativeDecimal.optional(),
  maxStock: nonNegativeDecimal.optional(),
});
export const productImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
  dryRun: z.boolean().default(true),
});

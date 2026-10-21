/**
 * Domain enumerations shared by the API, the web app and the mobile app.
 * The Prisma schema mirrors these values; keep both in sync.
 */

export const LOCALES = ['fr-TN', 'en', 'ar-TN'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr-TN';
export const DEFAULT_TIMEZONE = 'Africa/Tunis';
export const DEFAULT_CURRENCY = 'TND';

export const SECTORS = [
  'GROCERY',
  'WHOLESALE',
  'RETAIL',
  'AUTO_PARTS',
  'ELECTRONICS',
  'COSMETICS',
  'ECOMMERCE',
  'MULTI_STORE',
  'OTHER',
] as const;
export type Sector = (typeof SECTORS)[number];

export const PLANS = ['STARTER', 'BUSINESS', 'PRO_AI', 'ENTERPRISE'] as const;
export type Plan = (typeof PLANS)[number];

export const VALUATION_METHODS = ['WEIGHTED_AVERAGE', 'FIFO'] as const;
export type ValuationMethod = (typeof VALUATION_METHODS)[number];

export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_TRACKING = ['NONE', 'LOT', 'SERIAL'] as const;
export type ProductTracking = (typeof PRODUCT_TRACKING)[number];

export const MOVEMENT_TYPES = [
  'OPENING',
  'RECEIPT',
  'RECEIPT_REVERSAL',
  'SALE',
  'SALE_REVERSAL',
  'CUSTOMER_RETURN',
  'SUPPLIER_RETURN',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'COUNT_ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'BLOCK',
  'UNBLOCK',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Reasons accepted for manual adjustments. Each one maps to a translated label. */
export const ADJUSTMENT_REASONS = [
  'DAMAGED',
  'EXPIRED',
  'LOST',
  'THEFT_SUSPECTED',
  'FOUND',
  'CORRECTION',
  'INTERNAL_USE',
  'SAMPLE',
  'OTHER',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const TRANSFER_STATUSES = ['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const COUNT_SCOPES = ['FULL', 'PARTIAL', 'CYCLE'] as const;
export type CountScope = (typeof COUNT_SCOPES)[number];

export const COUNT_STATUSES = ['IN_PROGRESS', 'VALIDATED', 'CANCELLED'] as const;
export type CountStatus = (typeof COUNT_STATUSES)[number];

export const PO_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export const SALES_CHANNELS = ['POS', 'DIRECT'] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const SALES_STATUSES = ['COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELLED'] as const;
export type SalesStatus = (typeof SALES_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'CREDIT', 'BANK_TRANSFER', 'CHECK', 'MOBILE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const RECOMMENDATION_STATUSES = ['OPEN', 'APPROVED', 'MODIFIED', 'REJECTED', 'EXPIRED'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const RECOMMENDATION_PRIORITIES = ['CRITICAL', 'RECOMMENDED', 'DEFERRABLE'] as const;
export type RecommendationPriority = (typeof RECOMMENDATION_PRIORITIES)[number];

export const SYNC_OPERATION_TYPES = ['STOCK_COUNT_LINE', 'STOCK_ADJUSTMENT'] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

export const SYNC_STATUSES = ['APPLIED', 'CONFLICT', 'REJECTED', 'DUPLICATE'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'EXPIRY_SOON',
  'PO_APPROVAL_REQUIRED',
  'TRANSFER_PENDING',
  'RECEIPT_INCOMPLETE',
  'RECOMMENDATION',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

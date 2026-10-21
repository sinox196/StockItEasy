/**
 * Response shapes of the StockItEasy API v1. Decimal values are strings
 * (money: 3 decimals, quantities: up to 3 decimals) — never parse them into
 * floats for business calculations; use @stockiteasy/shared helpers.
 */
import type {
  MovementType,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  ProductTracking,
  PurchaseOrderStatus,
  RecommendationPriority,
  RecommendationStatus,
  SalesStatus,
  Sector,
  TransferStatus,
} from '@stockiteasy/shared';

export type Dec = string;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  locale: string;
  timezone: string;
  emailVerified: boolean;
  isSuperAdmin: boolean;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  sector: Sector;
  currency: string;
  timezone: string;
  defaultLocale: string;
  isDemo: boolean;
  role: { id: string; key: string | null; name: string; permissions: string[] };
}

export interface Me {
  user: PublicUser;
  organizations: OrganizationSummary[];
}

export interface AuthResponse {
  user?: PublicUser;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  sector: Sector;
  city: string | null;
  address: string | null;
  phone: string | null;
  taxId: string | null;
  currency: string;
  timezone: string;
  defaultLocale: string;
  valuationMethod: 'WEIGHTED_AVERAGE' | 'FIFO';
  allowNegativeStock: boolean;
  purchaseBudget: Dec | null;
  serviceLevel: Dec;
  reviewPeriodDays: number;
  enabledPaymentMethods: PaymentMethod[];
  isDemo: boolean;
  subscription?: Subscription | null;
}

export interface Subscription {
  plan: 'STARTER' | 'BUSINESS' | 'PRO_AI' | 'ENTERPRISE';
  status: string;
  maxUsers: number | null;
  maxWarehouses: number | null;
  maxProducts: number | null;
  aiEnabled: boolean;
}

export interface StockSummary {
  onHand: Dec;
  reserved: Dec;
  blocked: Dec;
  available: Dec;
  state: 'OK' | 'LOW' | 'OUT';
}

export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  baseUnit: string;
  allowFractionalQty: boolean;
  purchasePrice: Dec;
  salePrice: Dec;
  salePriceTtc: Dec;
  averageCost: Dec;
  taxRate: Dec;
  minStock: Dec;
  maxStock: Dec | null;
  status: ProductStatus;
  tracking: ProductTracking;
  hasExpiry: boolean;
  isDemo: boolean;
  version: number;
  category: { id: string; name: string } | null;
  barcode: string | null;
  imageUrl: string | null;
  stock: StockSummary;
}

export interface Product extends Omit<ProductListItem, 'barcode' | 'imageUrl'> {
  description: string | null;
  categoryId: string | null;
  minSalePrice: Dec | null;
  preferredSupplierId: string | null;
  parentId: string | null;
  variantAttributes: Record<string, string> | null;
  barcodes: { id: string; code: string; unitCode: string | null; isPrimary: boolean }[];
  conversions: { id: string; unitCode: string; factor: Dec }[];
  images: { id: string; url: string }[];
  preferredSupplier: { id: string; name: string } | null;
  parent: { id: string; name: string; sku: string } | null;
  variants: { id: string; name: string; sku: string; variantAttributes: Record<string, string> | null }[];
  supplierProducts: { id: string; supplierId: string; unitPrice: Dec; minOrderQty: Dec | null; packSize: Dec | null; leadTimeDays: number | null; isPreferred: boolean; supplier: { id: string; name: string } }[];
  balances: { id: string; warehouseId: string; quantityOnHand: Dec; quantityReserved: Dec; quantityBlocked: Dec; warehouse: { id: string; name: string; code: string } }[];
  marginRate: Dec | null;
  stockValue: Dec;
}

export interface LookupResult {
  product: Product;
  scannedUnit: string;
  unitFactor: Dec;
  warehouseStock: StockSummary | null;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  productsCount: number;
}

export interface Store {
  id: string;
  name: string;
  code: string;
  city: string | null;
  address: string | null;
  isActive: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  city: string | null;
  isActive: boolean;
  storeId: string | null;
  store: { id: string; name: string } | null;
  stockValue: Dec;
  productsInStock: number;
  units: Dec;
  _count: { locations: number };
}

export interface Location {
  id: string;
  code: string;
  zone: string | null;
  aisle: string | null;
  shelf: string | null;
  bin: string | null;
}

export interface Movement {
  id: string;
  productId: string;
  warehouseId: string;
  type: MovementType;
  quantity: Dec;
  unitCost: Dec;
  totalCost: Dec;
  balanceAfter: Dec;
  reason: string | null;
  note: string | null;
  referenceType: string | null;
  referenceId: string | null;
  occurredAt: string;
  product?: { id: string; name: string; sku: string; baseUnit: string };
  warehouse?: { id: string; name: string; code: string };
  user?: { id: string; fullName: string } | null;
}

export interface Balance {
  id: string;
  productId: string;
  warehouseId: string;
  quantityOnHand: Dec;
  quantityReserved: Dec;
  quantityBlocked: Dec;
  quantityAvailable: Dec;
  value: Dec;
  warehouse: { id: string; name: string; code: string };
  product: { id: string; name: string; sku: string; averageCost: Dec; minStock: Dec; baseUnit: string };
}

export interface Lot {
  id: string;
  lotNumber: string;
  expiryDate: string | null;
  quantity: Dec;
  warehouseId: string;
}

export interface TransferLine {
  id: string;
  productId: string;
  quantity: Dec;
  quantityReceived: Dec | null;
  product?: { id: string; name: string; sku: string; baseUnit: string };
}

export interface Transfer {
  id: string;
  number: string;
  status: TransferStatus;
  fromWarehouseId: string;
  toWarehouseId: string;
  note: string | null;
  createdAt: string;
  shippedAt: string | null;
  receivedAt: string | null;
  from?: { id: string; name: string };
  to?: { id: string; name: string };
  lines?: TransferLine[];
  _count?: { lines: number };
}

export interface CountLine {
  id: string;
  productId: string;
  expectedQty: Dec;
  countedQty: Dec | null;
  countedAt: string | null;
  version: number;
  variance: Dec | null;
  varianceValue: Dec | null;
  product?: { id: string; name: string; sku: string; baseUnit: string; barcodes: string[] };
}

export interface StockCount {
  id: string;
  number: string;
  warehouseId: string;
  scope: 'FULL' | 'PARTIAL' | 'CYCLE';
  status: 'IN_PROGRESS' | 'VALIDATED' | 'CANCELLED';
  note: string | null;
  createdAt: string;
  validatedAt: string | null;
  warehouseName?: string;
  warehouse?: { id: string; name: string };
  totalLines?: number;
  countedLines?: number;
  lines?: CountLine[];
}

export interface Supplier {
  id: string;
  name: string;
  code: string | null;
  contactName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  taxId: string | null;
  paymentTermsDays: number;
  leadTimeDays: number;
  minOrderAmount: Dec | null;
  notes: string | null;
  isActive: boolean;
  isDemo: boolean;
  _count?: { products: number; purchaseOrders: number };
}

export interface SupplierPerformance {
  sufficientData: boolean;
  ordersConsidered: number;
  completedOrders: number;
  onTimeRate: number | null;
  fillRate: number | null;
  priceIndex: number | null;
  avgLeadTimeDays: number | null;
  score: number | null;
  weights: { onTime: number; fillRate: number; price: number };
}

export interface SupplierDetail extends Supplier {
  products: { id: string; productId: string; supplierSku: string | null; unitPrice: Dec; minOrderQty: Dec | null; packSize: Dec | null; leadTimeDays: number | null; isPreferred: boolean; product: { id: string; name: string; sku: string; baseUnit: string; purchasePrice: Dec } }[];
  priceHistory: { id: string; productId: string; unitPrice: Dec; source: string; recordedAt: string }[];
  performance: SupplierPerformance;
  orders: { id: string; number: string; status: PurchaseOrderStatus; total: Dec; orderDate: string; expectedDate: string | null; receivedAt: string | null }[];
}

export interface PurchaseOrderLine {
  id: string;
  productId: string;
  quantity: Dec;
  quantityReceived: Dec;
  unitPrice: Dec;
  taxRate: Dec;
  lineTotal: Dec;
  remaining: Dec;
  product?: { id: string; name: string; sku: string; baseUnit: string; tracking: ProductTracking; hasExpiry: boolean };
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  status: PurchaseOrderStatus;
  source: 'MANUAL' | 'AUTOPILOT';
  orderDate: string;
  expectedDate: string | null;
  subtotal: Dec;
  taxTotal: Dec;
  total: Dec;
  notes: string | null;
  isDemo: boolean;
  supplier: Supplier | { id: string; name: string };
  warehouse?: { id: string; name: string } | null;
  lines?: PurchaseOrderLine[];
  receipts?: { id: string; number: string; status: 'POSTED' | 'CANCELLED'; receivedAt: string; lines: { id: string; productId: string; quantity: Dec; unitCost: Dec; lotNumber: string | null }[] }[];
  _count?: { lines: number };
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  taxId: string | null;
  creditLimit: Dec | null;
  balance: Dec;
  notes: string | null;
  isDemo: boolean;
  _count?: { sales: number };
}

export interface SaleLine {
  id: string;
  productId: string;
  quantity: Dec;
  returnedQty: Dec;
  unitPrice: Dec;
  discountRate: Dec;
  taxRate: Dec;
  netTotal: Dec;
  taxTotal: Dec;
  lineTotal: Dec;
  unitCost: Dec;
  costTotal: Dec;
  margin: Dec;
  product?: { id: string; name: string; sku: string; baseUnit: string };
}

export interface Sale {
  id: string;
  number: string;
  customerId: string | null;
  warehouseId: string;
  channel: 'POS' | 'DIRECT';
  status: SalesStatus;
  subtotal: Dec;
  discountTotal: Dec;
  taxTotal: Dec;
  total: Dec;
  costTotal: Dec;
  paidTotal: Dec;
  refundedTotal: Dec;
  paymentStatus: PaymentStatus;
  completedAt: string;
  isDemo: boolean;
  margin: Dec;
  marginRate?: Dec | null;
  due?: Dec;
  customer: { id: string; name: string } | Customer | null;
  lines?: SaleLine[];
  payments?: { id: string; method: PaymentMethod; amount: Dec; isRefund: boolean; paidAt: string }[];
  _count?: { lines: number };
}

export interface Recommendation {
  id: string;
  productId: string;
  warehouseId: string;
  supplierId: string | null;
  status: RecommendationStatus;
  priority: RecommendationPriority;
  method: 'FORECAST' | 'MIN_STOCK_RULE';
  available: Dec;
  onOrder: Dec;
  averageDaily: Dec | null;
  leadTimeDays: number;
  daysOfCover: Dec | null;
  stockoutDate: string | null;
  suggestedQty: Dec;
  unitCost: Dec;
  estimatedCost: Dec;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: { key: string; params?: Record<string, string | number> }[];
  assumptions: Record<string, string | number | null>;
  computedAt: string;
  purchaseOrderId: string | null;
  product?: { id: string; name: string; sku: string; baseUnit: string };
  warehouse?: { id: string; name: string };
  supplier?: { id: string; name: string } | null;
}

export interface BudgetPlanItem {
  id: string;
  priority: RecommendationPriority;
  estimatedCost: Dec;
  daysOfCover: number | null;
  stockoutDate: string | null;
  suggestedQty: Dec;
  product?: { id: string; name: string; sku: string };
  warehouse?: { id: string; name: string };
}

export interface BudgetPlan {
  budget: Dec;
  requested: Dec;
  funded: BudgetPlanItem[];
  deferred: BudgetPlanItem[];
  fundedCost: Dec;
  remainingBudget: Dec;
  shortfall: Dec;
  isProjection: true;
  groups: { critical: BudgetPlanItem[]; recommended: BudgetPlanItem[]; deferrable: BudgetPlanItem[] };
}

export interface DashboardSummary {
  period: { from: string; to: string };
  kpis: {
    stockValue: Dec;
    activeProducts: number;
    quantityOnHand: Dec;
    quantityReserved: Dec;
    quantityBlocked: Dec;
    quantityAvailable: Dec;
    outOfStock: number;
    lowStock: number;
    pendingPurchases: number;
    pendingPurchasesValue: Dec;
    salesTodayCount: number;
    salesToday: Dec;
    salesCount: number;
    revenue: Dec;
    cogs: Dec;
    grossMargin: Dec;
    grossMarginRate: Dec | null;
    slowMovers: number;
    slowMoversValue: Dec;
    expiringSoon: number;
    replenishmentBudget: Dec;
    openRecommendations: number;
  };
  alerts: {
    outOfStock: { id: string; name: string; sku: string; available: Dec; minStock: Dec }[];
    lowStock: { id: string; name: string; sku: string; available: Dec; minStock: Dec }[];
    expiring: (Lot & { product?: { id: string; name: string; sku: string } })[];
  };
}

export interface DashboardCharts {
  salesByDay: { day: string; revenue: number; count: number }[];
  movementsByDay: { day: string; inbound: number; outbound: number }[];
  topProducts: { id: string; name: string; sku: string; quantity: number; revenue: number }[];
  stockByCategory: { category: string | null; value: number }[];
  valueByWarehouse: { warehouse: string; value: number }[];
}

export interface Notification {
  id: string;
  type: string;
  params: Record<string, string | number>;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  data: unknown;
  ip: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string } | null;
}

export interface Role {
  id: string;
  key: string | null;
  name: string;
  isSystem: boolean;
  permissions: string[];
  _count: { members: number };
}

export interface Member {
  id: string;
  userId: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  user: { id: string; email: string; fullName: string; lastLoginAt: string | null };
  role: { id: string; key: string | null; name: string };
}

export interface Invitation {
  id: string;
  email: string;
  expiresAt: string;
  role: { id: string; key: string | null; name: string };
}

export interface SessionInfo {
  id: string;
  client: string;
  deviceName: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface SyncResult {
  clientOpId: string;
  status: 'APPLIED' | 'CONFLICT' | 'REJECTED' | 'DUPLICATE';
  result?: unknown;
  error?: { code: string; details?: unknown };
}

export interface SyncSnapshot {
  serverTime: string;
  warehouses: { id: string; name: string; code: string }[];
  products: {
    id: string;
    sku: string;
    name: string;
    baseUnit: string;
    allowFractionalQty: boolean;
    salePrice: Dec;
    taxRate: Dec;
    minStock: Dec;
    updatedAt: string;
    barcodes: { code: string; unitCode: string | null }[];
    conversions: { unitCode: string; factor: Dec }[];
    balances: { warehouseId: string; quantityOnHand: Dec; quantityReserved: Dec; quantityBlocked: Dec; version: number }[];
  }[];
  counts: { id: string; number: string; warehouseId: string; scope: string; lines: { id: string; productId: string; expectedQty: Dec; countedQty: Dec | null; version: number }[] }[];
}

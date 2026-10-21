import type * as T from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(code);
  }
}

export interface ApiClientOptions {
  /** Base URL including the /api/v1 prefix, e.g. "/api/v1" (web, via rewrite) or "https://api.example.com/api/v1". */
  baseUrl: string;
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  getOrganizationId: () => string | null;
  /** Obtains a new access token (cookie refresh on web, SecureStore refresh token on mobile). Returns null when impossible. */
  refresh: () => Promise<string | null>;
  onAuthFailure?: () => void;
  getLocale?: () => string;
  fetchImpl?: typeof fetch;
  credentials?: RequestCredentials;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  idempotencyKey?: string;
  /** Skip the X-Organization-Id header (account-level routes). */
  noOrg?: boolean;
  /** Do not try to refresh on 401 (auth routes). */
  noRefresh?: boolean;
  raw?: boolean;
}

export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function qs(query?: Query): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Typed client for the StockItEasy API, shared by the web and mobile apps.
 * Handles bearer tokens, the tenant header, idempotency keys, and a single-flight
 * token refresh on 401 followed by one retry.
 */
export class ApiClient {
  private refreshing: Promise<string | null> | null = null;

  constructor(private readonly opts: ApiClientOptions) {}

  private async refreshOnce(): Promise<string | null> {
    if (!this.refreshing) {
      this.refreshing = this.opts.refresh().finally(() => {
        setTimeout(() => (this.refreshing = null), 0);
      });
    }
    return this.refreshing;
  }

  async request<R>(method: string, path: string, o: RequestOptions = {}, retried = false): Promise<R> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = this.opts.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const org = this.opts.getOrganizationId();
    if (org && !o.noOrg) headers['X-Organization-Id'] = org;
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    if (o.idempotencyKey) headers['Idempotency-Key'] = o.idempotencyKey;
    const locale = this.opts.getLocale?.();
    if (locale) headers['Accept-Language'] = locale;

    const f = this.opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await f(`${this.opts.baseUrl}${path}${qs(o.query)}`, {
        method,
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        credentials: this.opts.credentials ?? 'include',
      });
    } catch {
      throw new ApiError(0, 'NETWORK');
    }

    if (res.status === 401 && !o.noRefresh && !retried) {
      const fresh = await this.refreshOnce().catch(() => null);
      if (fresh) {
        this.opts.setAccessToken(fresh);
        return this.request<R>(method, path, o, true);
      }
      this.opts.onAuthFailure?.();
    }
    if (o.raw && res.ok) return (await res.text()) as unknown as R;
    if (res.status === 204) return undefined as R;
    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined;
    if (!res.ok) {
      const body = (data ?? {}) as { code?: string; details?: unknown; requestId?: string };
      throw new ApiError(res.status, body.code ?? 'UNKNOWN', body.details, body.requestId);
    }
    return data as R;
  }

  get = <R>(path: string, query?: Query, o: RequestOptions = {}) => this.request<R>('GET', path, { ...o, query });
  post = <R>(path: string, body?: unknown, o: RequestOptions = {}) => this.request<R>('POST', path, { ...o, body: body ?? {} });
  put = <R>(path: string, body?: unknown, o: RequestOptions = {}) => this.request<R>('PUT', path, { ...o, body: body ?? {} });
  patch = <R>(path: string, body?: unknown, o: RequestOptions = {}) => this.request<R>('PATCH', path, { ...o, body: body ?? {} });
  del = <R>(path: string, o: RequestOptions = {}) => this.request<R>('DELETE', path, o);

  /* --------------------------------- Auth --------------------------------- */

  auth = {
    login: (body: { email: string; password: string; client?: 'web' | 'mobile'; deviceName?: string }) =>
      this.post<T.AuthResponse>('/auth/login', body, { noOrg: true, noRefresh: true }),
    register: (body: { fullName: string; email: string; password: string; locale?: string; acceptTerms: true }) =>
      this.post<T.AuthResponse>('/auth/register', body, { noOrg: true, noRefresh: true }),
    refresh: (refreshToken?: string) => this.post<T.AuthResponse>('/auth/refresh', refreshToken ? { refreshToken } : {}, { noOrg: true, noRefresh: true }),
    logout: () => this.post<void>('/auth/logout', {}, { noOrg: true, noRefresh: true }),
    forgotPassword: (email: string) => this.post<{ accepted: boolean }>('/auth/forgot-password', { email }, { noOrg: true, noRefresh: true }),
    resetPassword: (token: string, password: string) => this.post<void>('/auth/reset-password', { token, password }, { noOrg: true, noRefresh: true }),
    verifyEmail: (token: string) => this.post<void>('/auth/verify-email', { token }, { noOrg: true, noRefresh: true }),
    resendVerification: () => this.post<{ accepted: boolean }>('/auth/resend-verification', {}, { noOrg: true }),
    sessions: () => this.get<T.SessionInfo[]>('/auth/sessions', undefined, { noOrg: true }),
    revokeSession: (id: string) => this.del<void>(`/auth/sessions/${id}`, { noOrg: true }),
    changePassword: (currentPassword: string, newPassword: string) => this.post<void>('/auth/change-password', { currentPassword, newPassword }, { noOrg: true }),
  };

  me = {
    get: () => this.get<T.Me>('/me', undefined, { noOrg: true }),
    update: (body: { fullName?: string; locale?: string; timezone?: string }) => this.patch<T.PublicUser>('/me', body, { noOrg: true }),
  };

  /* ----------------------------- Organization ----------------------------- */

  organizations = {
    create: (body: Record<string, unknown>) => this.post<T.Organization>('/organizations', body, { noOrg: true }),
    current: () => this.get<T.Organization>('/organizations/current'),
    update: (body: Record<string, unknown>) => this.patch<T.Organization>('/organizations/current', body),
    usage: () => this.get<{ subscription: T.Subscription | null; usage: { users: number; warehouses: number; products: number } }>('/organizations/current/usage'),
    members: () => this.get<{ members: T.Member[]; invitations: T.Invitation[] }>('/organizations/current/members'),
    invite: (email: string, roleId: string) => this.post<T.Invitation>('/organizations/current/invitations', { email, roleId }),
    revokeInvitation: (id: string) => this.del<void>(`/organizations/current/invitations/${id}`),
    updateMember: (id: string, body: { roleId?: string; status?: 'ACTIVE' | 'DISABLED' }) => this.patch<T.Member>(`/organizations/current/members/${id}`, body),
    roles: () => this.get<T.Role[]>('/organizations/current/roles'),
    createRole: (body: { name: string; permissions: string[] }) => this.post<T.Role>('/organizations/current/roles', body),
    updateRole: (id: string, body: { name: string; permissions: string[] }) => this.put<T.Role>(`/organizations/current/roles/${id}`, body),
    deleteRole: (id: string) => this.del<void>(`/organizations/current/roles/${id}`),
  };

  invitations = {
    accept: (body: { token: string; fullName?: string; password?: string }) =>
      this.post<{ organizationId: string; tokens?: { accessToken: string } }>('/invitations/accept', body, { noOrg: true, noRefresh: true }),
    acceptExisting: (token: string) => this.post<{ organizationId: string }>('/invitations/accept-existing', { token }, { noOrg: true }),
  };

  /* -------------------------------- Catalog ------------------------------- */

  products = {
    list: (q: Query = {}) => this.get<T.Paginated<T.ProductListItem>>('/products', q),
    get: (id: string) => this.get<T.Product>(`/products/${id}`),
    create: (body: Record<string, unknown>) => this.post<T.Product>('/products', body),
    update: (id: string, body: Record<string, unknown>) => this.patch<T.Product>(`/products/${id}`, body),
    archive: (id: string) => this.del<void>(`/products/${id}`),
    lookup: (code: string, warehouseId?: string) => this.get<T.LookupResult>('/products/lookup', { code, warehouseId }),
    import: (rows: Record<string, unknown>[], dryRun: boolean) =>
      this.post<{ dryRun: boolean; report: { row: number; sku?: string; status: string; errors?: { path: string; message: string }[] }[]; valid?: number; invalid: number; created?: number; updated?: number }>('/products/import', { rows, dryRun }),
    exportCsv: () => this.request<string>('GET', '/products/export.csv', { raw: true }),
  };

  categories = {
    list: () => this.get<T.Category[]>('/categories'),
    create: (body: { name: string; parentId?: string | null }) => this.post<T.Category>('/categories', body),
    update: (id: string, body: { name: string; parentId?: string | null }) => this.put<T.Category>(`/categories/${id}`, body),
    remove: (id: string) => this.del<void>(`/categories/${id}`),
  };

  stores = {
    list: () => this.get<T.Store[]>('/stores'),
    create: (body: Record<string, unknown>) => this.post<T.Store>('/stores', body),
    update: (id: string, body: Record<string, unknown>) => this.put<T.Store>(`/stores/${id}`, body),
  };

  warehouses = {
    list: () => this.get<T.Warehouse[]>('/warehouses'),
    create: (body: Record<string, unknown>) => this.post<T.Warehouse>('/warehouses', body),
    update: (id: string, body: Record<string, unknown>) => this.put<T.Warehouse>(`/warehouses/${id}`, body),
    locations: (id: string) => this.get<T.Location[]>(`/warehouses/${id}/locations`),
    createLocation: (id: string, body: Record<string, unknown>) => this.post<T.Location>(`/warehouses/${id}/locations`, body),
  };

  /* ------------------------------- Inventory ------------------------------ */

  inventory = {
    balances: (q: { productId?: string; warehouseId?: string }) => this.get<T.Balance[]>('/inventory/balances', q),
    movements: (q: Query = {}) => this.get<T.Paginated<T.Movement>>('/inventory/movements', q),
    adjust: (body: Record<string, unknown>, idempotencyKey = newIdempotencyKey()) =>
      this.post<{ movementIds: string[]; balanceAfter: string; availableAfter: string }>('/inventory/adjustments', body, { idempotencyKey }),
    block: (body: Record<string, unknown>) => this.post<{ availableAfter: string }>('/inventory/blocks', body),
    reservations: () => this.get<unknown[]>('/inventory/reservations'),
    reserve: (body: Record<string, unknown>) => this.post<unknown>('/inventory/reservations', body),
    release: (id: string) => this.post<unknown>(`/inventory/reservations/${id}/release`),
    lots: (productId: string) => this.get<T.Lot[]>(`/inventory/lots/${productId}`),
  };

  transfers = {
    list: (q: Query = {}) => this.get<T.Paginated<T.Transfer>>('/transfers', q),
    get: (id: string) => this.get<T.Transfer>(`/transfers/${id}`),
    create: (body: Record<string, unknown>) => this.post<T.Transfer>('/transfers', body),
    ship: (id: string) => this.post<T.Transfer>(`/transfers/${id}/ship`),
    receive: (id: string, body: { lines: { lineId: string; quantityReceived: string }[]; note?: string }) => this.post<T.Transfer>(`/transfers/${id}/receive`, body),
    cancel: (id: string) => this.post<T.Transfer>(`/transfers/${id}/cancel`),
  };

  counts = {
    list: (q: Query = {}) => this.get<T.Paginated<T.StockCount>>('/stock-counts', q),
    get: (id: string) => this.get<T.StockCount>(`/stock-counts/${id}`),
    create: (body: Record<string, unknown>) => this.post<T.StockCount>('/stock-counts', body),
    record: (id: string, body: { productId: string; countedQty: string; mode?: 'replace' | 'add' }) =>
      this.put<{ status: string; line: { lineId: string; countedQty: string; expectedQty: string; version: number } }>(`/stock-counts/${id}/lines`, body),
    validate: (id: string) => this.post<{ adjustments: number; varianceValue: string }>(`/stock-counts/${id}/validate`),
    cancel: (id: string) => this.post<void>(`/stock-counts/${id}/cancel`),
  };

  /* ------------------------------ Purchasing ------------------------------ */

  suppliers = {
    list: (q: Query = {}) => this.get<T.Paginated<T.Supplier>>('/suppliers', q),
    get: (id: string) => this.get<T.SupplierDetail>(`/suppliers/${id}`),
    create: (body: Record<string, unknown>) => this.post<T.Supplier>('/suppliers', body),
    update: (id: string, body: Record<string, unknown>) => this.put<T.Supplier>(`/suppliers/${id}`, body),
    upsertProduct: (id: string, body: Record<string, unknown>) => this.put<unknown>(`/suppliers/${id}/products`, body),
    removeProduct: (id: string, productId: string) => this.del<void>(`/suppliers/${id}/products/${productId}`),
  };

  purchases = {
    list: (q: Query = {}) => this.get<T.Paginated<T.PurchaseOrder>>('/purchases', q),
    get: (id: string) => this.get<T.PurchaseOrder>(`/purchases/${id}`),
    create: (body: Record<string, unknown>, idempotencyKey = newIdempotencyKey()) => this.post<T.PurchaseOrder>('/purchases', body, { idempotencyKey }),
    update: (id: string, body: Record<string, unknown>) => this.patch<T.PurchaseOrder>(`/purchases/${id}`, body),
    submit: (id: string) => this.post<T.PurchaseOrder>(`/purchases/${id}/submit`),
    approve: (id: string) => this.post<T.PurchaseOrder>(`/purchases/${id}/approve`),
    send: (id: string) => this.post<T.PurchaseOrder>(`/purchases/${id}/send`),
    cancel: (id: string) => this.post<T.PurchaseOrder>(`/purchases/${id}/cancel`),
    receive: (id: string, body: Record<string, unknown>, idempotencyKey = newIdempotencyKey()) =>
      this.post<{ receiptId: string; order: T.PurchaseOrder }>(`/purchases/${id}/receipts`, body, { idempotencyKey }),
    cancelReceipt: (receiptId: string) => this.post<{ cancelled: boolean }>(`/purchases/receipts/${receiptId}/cancel`),
  };

  /* --------------------------------- Sales -------------------------------- */

  sales = {
    list: (q: Query = {}) => this.get<T.Paginated<T.Sale>>('/sales', q),
    get: (id: string) => this.get<T.Sale>(`/sales/${id}`),
    create: (body: Record<string, unknown>, idempotencyKey = newIdempotencyKey()) => this.post<T.Sale>('/sales', body, { idempotencyKey }),
    pay: (id: string, body: { method: string; amount: string; reference?: string }) => this.post<T.Sale>(`/sales/${id}/payments`, body),
    return: (id: string, body: Record<string, unknown>) => this.post<T.Sale>(`/sales/${id}/returns`, body),
    cancel: (id: string) => this.post<T.Sale>(`/sales/${id}/cancel`),
  };

  customers = {
    list: (q: Query = {}) => this.get<T.Paginated<T.Customer>>('/customers', q),
    get: (id: string) => this.get<T.Customer & { sales: T.Sale[] }>(`/customers/${id}`),
    create: (body: Record<string, unknown>) => this.post<T.Customer>('/customers', body),
    update: (id: string, body: Record<string, unknown>) => this.put<T.Customer>(`/customers/${id}`, body),
  };

  /* ------------------------------- Autopilot ------------------------------ */

  autopilot = {
    list: (status = 'OPEN') => this.get<{ computedAt: string | null; items: T.Recommendation[] }>('/replenishment/recommendations', { status }),
    run: () => this.post<{ computedAt: string; recommendations: number }>('/replenishment/run'),
    decide: (id: string, body: { decision: 'APPROVE' | 'MODIFY' | 'REJECT'; quantity?: string; supplierId?: string; reason?: string }) =>
      this.post<{ status: string; purchaseOrderId?: string; purchaseOrderNumber?: string }>(`/replenishment/recommendations/${id}/decision`, body),
    budgetPlan: (budget: string) => this.post<T.BudgetPlan>('/replenishment/budget-plan', { budget }),
  };

  /* --------------------------- Dashboard & reports ------------------------- */

  dashboard = {
    summary: (q: Query = {}) => this.get<T.DashboardSummary>('/dashboard/summary', q),
    charts: (q: Query = {}) => this.get<T.DashboardCharts>('/dashboard/charts', q),
  };

  reports = {
    valuation: (warehouseId?: string) =>
      this.get<{ total: string; rows: { id: string; sku: string; name: string; category: string | null; onHand: string; averageCost: string; value: string }[] }>('/reports/valuation', { warehouseId }),
    valuationCsv: (warehouseId?: string) => this.request<string>('GET', '/reports/valuation.csv', { raw: true, query: { warehouseId } }),
    abc: (days = 90) =>
      this.get<{ days: number; totalRevenue: string; rows: { id: string; sku: string; name: string; revenue: string; quantity: string; share: string; cumulativeShare: string; class: 'A' | 'B' | 'C' }[] }>('/reports/abc', { days }),
    dormant: (minDays = 60) =>
      this.get<{ minDays: number; immobilized: string; rows: { id: string; sku: string; name: string; onHand: string; value: string; lastSale: string | null; daysWithoutSale: number | null }[] }>('/reports/dormant', { minDays }),
    sales: (q: Query = {}) =>
      this.get<{ rows: { id: string; sku: string; name: string; quantity: string; revenue: string; cost: string; margin: string; marginRate: string | null }[] }>('/reports/sales', q),
  };

  /* -------------------------------- Platform ------------------------------ */

  notifications = {
    list: (q: Query = {}) => this.get<T.Paginated<T.Notification> & { unreadCount: number }>('/notifications', q),
    read: (id: string) => this.post<void>(`/notifications/${id}/read`),
    readAll: () => this.post<void>('/notifications/read-all'),
  };

  audit = {
    list: (q: Query = {}) => this.get<T.Paginated<T.AuditEntry>>('/audit-logs', q),
  };

  sync = {
    snapshot: (warehouseId?: string) => this.get<T.SyncSnapshot>('/sync/snapshot', { warehouseId }),
    push: (body: { deviceId: string; operations: Record<string, unknown>[] }) => this.post<{ results: T.SyncResult[]; serverTime: string }>('/sync/push', body),
  };

  admin = {
    organizations: (q: Query = {}) => this.get<T.Paginated<T.Organization & { subscription: T.Subscription | null; _count: { members: number; warehouses: number; products: number } }>>('/admin/organizations', q, { noOrg: true }),
    setPlan: (id: string, plan: string) => this.put<T.Subscription>(`/admin/organizations/${id}/plan`, { plan }, { noOrg: true }),
    stats: () => this.get<{ organizations: number; users: number; products: number; sales: number }>('/admin/stats', undefined, { noOrg: true }),
  };
}

export function createApiClient(opts: ApiClientOptions) {
  return new ApiClient(opts);
}

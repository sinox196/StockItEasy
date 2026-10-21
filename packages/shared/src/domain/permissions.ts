/**
 * RBAC model. A permission is "<module>.<action>". Each organization owns its
 * roles; system roles are seeded from SYSTEM_ROLES below and can be customised
 * per organization (except OWNER, which always keeps every permission).
 */

export const PERMISSION_MODULES = [
  'dashboard',
  'products',
  'categories',
  'warehouses',
  'inventory',
  'transfers',
  'stock_counts',
  'suppliers',
  'purchases',
  'sales',
  'customers',
  'autopilot',
  'reports',
  'users',
  'settings',
  'audit',
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete', 'approve', 'export'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type Permission = `${PermissionModule}.${PermissionAction}`;

/** Actions that make sense for each module; drives the editable permission matrix. */
export const MODULE_ACTIONS: Record<PermissionModule, readonly PermissionAction[]> = {
  dashboard: ['read'],
  products: ['read', 'create', 'update', 'delete', 'export'],
  categories: ['read', 'create', 'update', 'delete'],
  warehouses: ['read', 'create', 'update', 'delete'],
  inventory: ['read', 'create', 'approve', 'export'],
  transfers: ['read', 'create', 'update', 'approve'],
  stock_counts: ['read', 'create', 'update', 'approve'],
  suppliers: ['read', 'create', 'update', 'delete'],
  purchases: ['read', 'create', 'update', 'approve', 'export'],
  sales: ['read', 'create', 'update', 'approve', 'export'],
  customers: ['read', 'create', 'update', 'delete'],
  autopilot: ['read', 'approve'],
  reports: ['read', 'export'],
  users: ['read', 'create', 'update', 'delete'],
  settings: ['read', 'update'],
  audit: ['read'],
};

export const ALL_PERMISSIONS: Permission[] = PERMISSION_MODULES.flatMap((m) =>
  MODULE_ACTIONS[m].map((a) => `${m}.${a}` as Permission),
);

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

export const ROLE_KEYS = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'STOCK_MANAGER',
  'BUYER',
  'CASHIER',
  'ACCOUNTANT',
  'EMPLOYEE',
  'VIEWER',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const readAll = (modules: PermissionModule[]): Permission[] => modules.map((m) => `${m}.read` as Permission);
const allOf = (m: PermissionModule): Permission[] => MODULE_ACTIONS[m].map((a) => `${m}.${a}` as Permission);

export const SYSTEM_ROLES: Record<RoleKey, Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS,
  MANAGER: ALL_PERMISSIONS.filter((p) => !p.startsWith('users.delete') && p !== 'settings.update'),
  STOCK_MANAGER: [
    ...readAll(['dashboard', 'suppliers', 'purchases', 'reports', 'autopilot']),
    ...allOf('products'),
    ...allOf('categories'),
    ...allOf('warehouses'),
    ...allOf('inventory'),
    ...allOf('transfers'),
    ...allOf('stock_counts'),
    'purchases.update',
  ],
  BUYER: [
    ...readAll(['dashboard', 'products', 'categories', 'warehouses', 'inventory', 'reports']),
    ...allOf('suppliers'),
    'purchases.read',
    'purchases.create',
    'purchases.update',
    'purchases.export',
    ...allOf('autopilot'),
  ],
  CASHIER: [
    ...readAll(['dashboard', 'products', 'categories', 'inventory']),
    'sales.read',
    'sales.create',
    'customers.read',
    'customers.create',
    'customers.update',
  ],
  ACCOUNTANT: [
    ...readAll(['dashboard', 'products', 'inventory', 'suppliers', 'purchases', 'sales', 'customers', 'audit']),
    ...allOf('reports'),
    'inventory.export',
    'purchases.export',
    'sales.export',
  ],
  EMPLOYEE: [
    ...readAll(['products', 'categories', 'warehouses', 'inventory', 'transfers', 'stock_counts']),
    'inventory.create',
    'transfers.create',
    'transfers.update',
    'stock_counts.create',
    'stock_counts.update',
    'purchases.read',
    'purchases.update',
  ],
  VIEWER: readAll(['dashboard', 'products', 'categories', 'warehouses', 'inventory', 'reports']),
};

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  return granted.includes(required);
}

import type { Permission } from '@stockiteasy/shared';
import {
  ArrowLeftRight,
  Bell,
  Boxes,
  ClipboardCheck,
  FileBarChart,
  History,
  LayoutDashboard,
  Languages,
  Package,
  ScanBarcode,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tags,
  Truck,
  Users,
  UserSquare2,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'nav.main',
    items: [
      { href: '/dashboard', label: 'nav.dashboard', icon: LayoutDashboard, permission: 'dashboard.read' },
      { href: '/pos', label: 'nav.pos', icon: ScanBarcode, permission: 'sales.create' },
    ],
  },
  {
    group: 'nav.operations',
    items: [
      { href: '/products', label: 'nav.products', icon: Package, permission: 'products.read' },
      { href: '/categories', label: 'nav.categories', icon: Tags, permission: 'categories.read' },
      { href: '/warehouses', label: 'nav.warehouses', icon: Warehouse, permission: 'warehouses.read' },
      { href: '/movements', label: 'nav.movements', icon: History, permission: 'inventory.read' },
      { href: '/transfers', label: 'nav.transfers', icon: ArrowLeftRight, permission: 'transfers.read' },
      { href: '/counts', label: 'nav.counts', icon: ClipboardCheck, permission: 'stock_counts.read' },
    ],
  },
  {
    group: 'nav.trade',
    items: [
      { href: '/suppliers', label: 'nav.suppliers', icon: Truck, permission: 'suppliers.read' },
      { href: '/purchases', label: 'nav.purchases', icon: Boxes, permission: 'purchases.read' },
      { href: '/sales', label: 'nav.sales', icon: ShoppingBag, permission: 'sales.read' },
      { href: '/customers', label: 'nav.customers', icon: UserSquare2, permission: 'customers.read' },
    ],
  },
  {
    group: 'nav.intelligence',
    items: [
      { href: '/autopilot', label: 'nav.autopilot', icon: Sparkles, permission: 'autopilot.read' },
      { href: '/cashflow', label: 'nav.cashflow', icon: Wallet, permission: 'autopilot.read' },
      { href: '/reports', label: 'nav.reports', icon: FileBarChart, permission: 'reports.read' },
    ],
  },
  {
    group: 'nav.admin',
    items: [
      { href: '/notifications', label: 'nav.notifications', icon: Bell },
      { href: '/users', label: 'nav.users', icon: Users, permission: 'users.read' },
      { href: '/settings', label: 'nav.settings', icon: Settings, permission: 'settings.read' },
      { href: '/settings/language', label: 'nav.language', icon: Languages },
      { href: '/audit', label: 'nav.audit', icon: ShieldCheck, permission: 'audit.read' },
    ],
  },
];

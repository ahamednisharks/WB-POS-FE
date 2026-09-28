import { Role } from '../../core/models';

export interface NavItem {
  label: string;
  icon: string;
  route?: string;
  /** Omitted = inherits from the parent group. */
  roles?: Role[];
  children?: NavItem[];
}

const ADMIN: Role[] = ['ADMIN'];
const ALL: Role[] = ['ADMIN', 'CASHIER'];

/** Sidebar menu. Filtered by the logged-in user's role. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'pi pi-chart-bar', route: '/dashboard', roles: ADMIN },
  {
    label: 'Master',
    icon: 'pi pi-database',
    roles: ADMIN,
    children: [
      { label: 'Category', icon: 'pi pi-th-large', route: '/master/categories' },
      { label: 'Item Master', icon: 'pi pi-box', route: '/master/items' },
      { label: 'Unit Master', icon: 'pi pi-sliders-h', route: '/master/units' },
      { label: 'Combo Master', icon: 'pi pi-gift', route: '/master/combos' },
      { label: 'Supplier Master', icon: 'pi pi-truck', route: '/master/suppliers' },
    ],
  },
  {
    label: 'Employee',
    icon: 'pi pi-users',
    roles: ADMIN,
    children: [
      { label: 'Employee Type', icon: 'pi pi-tags', route: '/employee/types' },
      { label: 'Employee Details', icon: 'pi pi-id-card', route: '/employee/details' },
      { label: 'Salary Details', icon: 'pi pi-wallet', route: '/employee/salary' },
      { label: 'Login Details', icon: 'pi pi-key', route: '/employee/logins' },
    ],
  },
  { label: 'Billing', icon: 'pi pi-calculator', route: '/billing', roles: ALL },
  { label: 'Orders', icon: 'pi pi-receipt', route: '/orders', roles: ALL },
  {
    label: 'Transactions',
    icon: 'pi pi-arrow-right-arrow-left',
    roles: ALL,
    children: [
      { label: 'Sales Transactions', icon: 'pi pi-money-bill', route: '/transactions/sales', roles: ALL },
      { label: 'Purchase Order (PO)', icon: 'pi pi-file-edit', route: '/transactions/purchase-orders', roles: ADMIN },
      { label: 'Purchase Entry (PE)', icon: 'pi pi-file-import', route: '/transactions/purchase-entries', roles: ADMIN },
    ],
  },
];

/** Keeps only the entries (and group children) the role may see. */
export function navFor(role: Role | undefined): NavItem[] {
  if (!role) return [];
  const allowed = (item: NavItem, inherited: Role[] | undefined) => (item.roles ?? inherited ?? ALL).includes(role);
  return NAV_ITEMS.filter((item) => allowed(item, undefined))
    .map((item) =>
      item.children ? { ...item, children: item.children.filter((c) => allowed(c, item.roles)) } : item,
    )
    .filter((item) => !item.children || item.children.length > 0);
}

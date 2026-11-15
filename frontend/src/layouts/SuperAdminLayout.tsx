import {
  LayoutDashboard,
  Store,
  Users,
  Package,
  ShoppingCart,
  BarChart3,
  CreditCard,
  TrendingUp
} from 'lucide-react';


import DashboardLayout, { type NavGroup } from './DashboardLayout';

const groups: NavGroup[] = [
  {
    label: 'Main',
    items: [{ to: '/super-admin', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Management',
    items: [
      { to: '/super-admin/branches', label: 'Branches', icon: Store },
      { to: '/super-admin/branch-admins', label: 'Branch Admins', icon: Users },
      { to: '/super-admin/staff', label: 'Staff', icon: Users },
      { to: '/super-admin/products', label: 'Products', icon: Package },
      { to: '/super-admin/inventories', label: 'Inventories', icon: Package },
      { to: '/super-admin/payment-methods', label: 'Payment Methods', icon: CreditCard },

    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/super-admin/sales', label: 'Sales', icon: ShoppingCart },
      { to: '/super-admin/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  { label: 'Planning', items: [{ to: '/super-admin/reorder', label: 'Reorder', icon: TrendingUp }] },
];

export default function SuperAdminLayout() {
  return <DashboardLayout groups={groups} />;
}
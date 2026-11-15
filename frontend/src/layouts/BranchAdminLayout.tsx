import {
  Boxes, LayoutDashboard,
  ShoppingCart, Tag, Users, BarChart3,
  TrendingUp
} from 'lucide-react';
import DashboardLayout, { type NavGroup } from './DashboardLayout';

const groups: NavGroup[] = [
  { label: 'Main', items: [{ to: '/branch-admin', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Inventory',
    items: [
      { to: '/branch-admin/products', label: 'Products', icon: Tag },
      { to: '/branch-admin/stock', label: 'Stock', icon: Boxes },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/branch-admin/sales', label: 'Sales', icon: ShoppingCart },
      { to: '/branch-admin/reports', label: 'Reports', icon: BarChart3 },
      { to: '/branch-admin/reorder', label: 'Reorder', icon: TrendingUp },
    ],
  },

  { label: 'Team', items: [{ to: '/branch-admin/sellers', label: 'Sellers', icon: Users }] },
];

export default function BranchAdminLayout() {
  return <DashboardLayout groups={groups} />;
}
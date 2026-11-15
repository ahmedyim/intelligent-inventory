import { LayoutDashboard, Package, Receipt, TrendingUp, ShoppingCart } from 'lucide-react';
import DashboardLayout, { type NavGroup } from './DashboardLayout';

const groups: NavGroup[] = [
  { label: 'Main', items: [{ to: '/seller', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Sales',
    items: [
      { to: '/seller/sales/new', label: 'New sale', icon: ShoppingCart },
      { to: '/seller/sales', label: 'My sales', icon: Receipt },
    ],
  },
  {
    label: 'Catalog', items: [
      { to: '/seller/products', label: 'Products', icon: Package },
      { to: '/seller/reorder', label: 'Reorder', icon: TrendingUp },
    ]
  },
];

export default function SellerLayout() {
  return <DashboardLayout groups={groups} />;
}
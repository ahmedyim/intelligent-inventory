import { createBrowserRouter } from 'react-router-dom';
import RoleRoute from '@/app/guards/RoleRoute';
import GuestRoute from '@/app/guards/GuestRoute';

import PublicLayout from '@/layouts/PublicLayout';
import SuperAdminLayout from '@/layouts/SuperAdminLayout';
import BranchAdminLayout from '@/layouts/BranchAdminLayout';

import Home from '@/pages/public/Home';
import About from '@/pages/public/About';
import Contact from '@/pages/public/Contact';
import NotFound from '@/pages/NotFound';
import Unauthorized from '@/pages/Unauthorized';

import LoginPage from '@/features/auth/LoginPage';
import ForgotPasswordPage from '@/features/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/features/auth/ResetPasswordPage';

// Super admin pages
import SADashboard from '@/pages/super-admin/Dashboard';
import Branches from '@/pages/super-admin/Branches';
import BranchAdmins from '@/pages/super-admin/BranchAdmins';
import Products from '@/pages/super-admin/Products';

import Inventory from '@/pages/super-admin/Inventory';
import Staff from '@/pages/super-admin/Staff';
import PaymentMethods from '@/pages/super-admin/PaymentMethods';
import StaffDetail from '@/pages/super-admin/StaffDetail';
import ProductDetailPage from '@/pages/super-admin/ProductDetail';
import BranchAdminProductDetail from '@/pages/branch-admin/ProductDetail';
import Reports from '@/pages/super-admin/Reports';
import Forecast from '@/pages/super-admin/Forecast';

// Seller pages
import BranchSellers from '@/pages/branch-admin/Sellers';
import SellerLayout from '@/layouts/SellerLayout';
import PosPage from '@/features/sales/PosPage';
import SellerDashboard from '@/features/seller/SellerDashboard';
import MySalesPage from '@/features/seller/MySalesPage';
import MySaleDetail from '@/features/seller/MySaleDetail';
import SellerProductsPage from '@/features/seller/SellerProductsPage';

// branch admin
import BranchProducts from '@/pages/branch-admin/Products';
import BADashboard from '@/pages/branch-admin/Dashboard';
import BranchReports from '@/pages/branch-admin/Reports';
import BranchStock from '@/pages/branch-admin/Stock';

// Shared feature pages
import SalesPage from '@/features/sales/SalesPage';
import SaleDetailPage from '@/features/sales/SaleDetail';
import ForecastPage from '@/features/forecast/ForecastPage';
export const router = createBrowserRouter([
  // Public website (header + footer)
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/about', element: <About /> },
      { path: '/contact', element: <Contact /> },
    ],
  },

  // Signed-out only: a signed-in user is redirected to their dashboard
  {
    element: <GuestRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },

  // Open to everyone: the emailed link must work even if someone is signed in
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/unauthorized', element: <Unauthorized /> },

  // Super Admin (guarded)
  {
    element: <RoleRoute allow={['SUPER_ADMIN']} />,
    children: [
      {
        path: '/super-admin',
        element: <SuperAdminLayout />,
        children: [
          { index: true, element: <SADashboard /> },
          { path: 'branches', element: <Branches /> },
          { path: 'branch-admins', element: <BranchAdmins /> },
          { path: 'staff', element: <Staff /> },
          { path: 'staff/:userId', element: <StaffDetail /> },
          { path: 'products', element: <Products /> },
          { path: 'products/:productId', element: <ProductDetailPage /> },
          { path: 'inventories', element: <Inventory /> },
          { path: 'payment-methods', element: <PaymentMethods /> },
          { path: 'sales', element: <SalesPage basePath={'/super-admin/sales'} /> },
          { path: 'sales/:saleId', element: <SaleDetailPage /> },
          { path: 'sales/new', element: <PosPage /> },
          { path: 'reports', element: <Reports /> },
          { path: 'reorder', element: <Forecast /> },
        ],
      },
    ],
  },

  // Branch Admin (guarded, sees only its own branch)
  {
    element: <RoleRoute allow={['BRANCH_ADMIN']} />,
    children: [
      {
        path: '/branch-admin',
        element: <BranchAdminLayout />,
        children: [
          { index: true, element: <BADashboard /> },
          // Add these as you build the pages:

          { path: 'products', element: <BranchProducts /> },
          { path: 'products/:productId', element: <BranchAdminProductDetail /> },
          { path: 'stock', element: <BranchStock /> },

          // { path: 'inventories', element: <BranchInventory /> },
          { path: 'sales', element: <SalesPage basePath={'/branch-admin/sales'} /> },
          { path: 'sales/:saleId', element: <SaleDetailPage /> },
          { path: 'sales/new', element: <PosPage /> },
          { path: 'sellers', element: <BranchSellers /> },
          { path: 'reports', element: <BranchReports /> },
          { path: 'reorder', element: <ForecastPage /> },
        ],
      },
    ],
  },

  // Seller (guarded)
  {
    element: <RoleRoute allow={['SELLER']} />,
    children: [
      {
        path: '/seller',
        element: <SellerLayout />,
        children: [
          { index: true, element: <SellerDashboard /> },
          { path: 'sales', element: <MySalesPage /> },
          { path: 'sales/new', element: <PosPage /> },
          { path: 'sales/:saleId', element: <MySaleDetail /> },
          { path: 'products', element: <SellerProductsPage /> },
          { path: 'reorder', element: <ForecastPage /> },
        ],
      },
    ],
  },

  { path: '*', element: <NotFound /> },
]);
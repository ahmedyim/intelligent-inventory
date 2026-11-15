import { NavLink, Outlet } from 'react-router-dom';
import {
    Bell,
    ClipboardList,
    FileText,
    LayoutDashboard,
    Package,
    Search,
    Settings,
    Store,
    Truck,
    Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import { cn } from '@/lib/utils';

const APP_NAME = 'InRetail'; // change to your brand name

// Edit the `to` paths to match your router.
const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
    { to: '/super-admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/super-admin/products', label: 'Products', icon: Package },
    { to: '/super-admin/inventory', label: 'Inventory', icon: Warehouse },
    { to: '/super-admin/orders', label: 'Orders', icon: ClipboardList },
    { to: '/super-admin/suppliers', label: 'Suppliers', icon: Truck },
    { to: '/super-admin/reports', label: 'Reports', icon: FileText },
    { to: '/super-admin/settings', label: 'Settings', icon: Settings },
];

const initials = (name?: string) =>
    (name ?? '')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('') || 'U';

export default function DashboardShell() {
    const user = useAppSelector((s) => s.auth.user);
    const { data: branches = [] } = useGetBranchesQuery();

    const linkClass = ({ isActive }: { isActive: boolean }) =>
        cn(
            'flex items-center gap-3 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
            isActive ? 'bg-orange-600 text-white shadow-sm' : 'text-zinc-600 hover:bg-orange-50 hover:text-orange-700'
        );

    return (
        <div className="min-h-screen bg-zinc-50">
            {/* Top bar */}
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-white px-4 py-3 md:px-6">
                <div className="flex items-center gap-2.5 md:w-56">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-600 text-white">
                        <Package className="h-5 w-5" />
                    </span>
                    <span className="text-lg font-semibold text-zinc-900">{APP_NAME}</span>
                </div>

                <label className="relative hidden max-w-md flex-1 sm:block">
                    <span className="sr-only">Search</span>
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                        type="search"
                        placeholder="Search products, orders, SKUs..."
                        className="w-full rounded-xl bg-zinc-100 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:bg-white focus:ring-2 focus:ring-orange-300"
                    />
                </label>

                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                    <label className="relative hidden sm:block">
                        <span className="sr-only">Branch</span>
                        <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <select className="appearance-none rounded-xl bg-zinc-100 py-2.5 pl-9 pr-8 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-300">
                            <option value="">All branches</option>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <button
                        type="button"
                        aria-label="Notifications"
                        className="relative grid h-10 w-10 place-items-center rounded-full text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                    >
                        <Bell className="h-5 w-5" />
                        <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                    </button>

                    <span
                        className="grid h-10 w-10 place-items-center rounded-full bg-orange-600 text-sm font-semibold text-white"
                        title={user?.full_name}
                    >
                        {initials(user?.full_name)}
                    </span>
                </div>
            </header>

            <div className="md:flex">
                {/* Sidebar (desktop) */}
                <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-64 shrink-0 border-r bg-white p-4 md:block">
                    <nav className="space-y-1.5" aria-label="Main">
                        {NAV.map(({ to, label, icon: Icon, end }) => (
                            <NavLink key={to} to={to} end={end} className={linkClass}>
                                <Icon className="h-5 w-5" />
                                {label}
                            </NavLink>
                        ))}
                    </nav>
                </aside>

                {/* Phone: scrollable nav pills */}
                <nav aria-label="Main" className="flex gap-2 overflow-x-auto border-b bg-white px-4 py-2 md:hidden">
                    {NAV.map(({ to, label, icon: Icon, end }) => (
                        <NavLink key={to} to={to} end={end} className={linkClass}>
                            <Icon className="h-4 w-4" />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <main className="min-w-0 flex-1 p-4 md:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Banknote,
    Coins,
    Package,
    PackageX,
    PiggyBank,
    Plus,
    Receipt,
    TriangleAlert,
    Warehouse,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import MobileHero from '@/components/MobileHero';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import WelcomeBanner from '@/components/WelcomeBanner';
import SalesChart from '@/components/SalesChart';
import { useAppSelector } from '@/app/hooks';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import { useGetSummaryQuery } from '@/features/reports/reportsApi';
import { useGetUsersQuery } from '@/features/users/usersApi';
import { formatCount, formatMoney, formatMoneyCompact, pctChange } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ReportPeriod } from '@/types';

const PERIODS: { value: ReportPeriod; label: string; compare: string }[] = [
    { value: 'today', label: 'Today', compare: 'yesterday' },
    { value: 'week', label: 'This week', compare: 'last week' },
    { value: 'month', label: 'This month', compare: 'last month' },
];

export default function BranchAdminDashboard() {
    const user = useAppSelector((s) => s.auth.user);
    const branchId = user?.branch_id ?? undefined;
    const [period, setPeriod] = useState<ReportPeriod>('month');

    // Everything below is scoped to the signed-in admin's own branch.
    const { data: branches = [], isLoading: loadingBranch } = useGetBranchesQuery();
    const branch = branches.find((b) => b.id === branchId);

    const { data: sellers, isLoading: loadingSellers } = useGetUsersQuery(
        { role: 'SELLER', branch_id: branchId },
        { skip: !branchId }
    );
    const {
        data: s,
        isFetching,
        isError,
        refetch,
    } = useGetSummaryQuery({ period, branch_id: branchId }, { skip: !branchId });

    const sellerItems = sellers?.items ?? [];
    const activeSellers = sellerItems.filter((u) => u.status === 'ACTIVE').length;
    const suspendedSellers = sellerItems.filter((u) => u.status === 'SUSPENDED').length;
    const recentSellers = sellerItems.slice(-5).reverse();
    const firstName = user?.full_name.split(' ')[0] ?? '';
    const branchName = branch?.name ?? 'your branch';

    const compare = PERIODS.find((p) => p.value === period)?.compare ?? '';
    const margin = s && s.revenue > 0 ? (s.profit / s.revenue) * 100 : null;
    const money = (n?: number) => (s && n !== undefined ? formatMoney(n) : '-');
    const moneyShort = (n?: number) => (s && n !== undefined ? formatMoneyCompact(n) : '-');
    const num = (n?: number) => (s && n !== undefined ? formatCount(n) : '-');

    if (!branchId) {
        return (
            <div className="rounded-md border bg-white p-6 text-center">
                <p className="text-sm text-muted-foreground">
                    Your account is not assigned to a branch yet. Please contact the super admin.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5 md:space-y-3">
            <h1 className="text-xl font-semibold md:hidden">Dashboard</h1>

            {/* Desktop and tablet: welcome banner */}
            <div className="hidden md:block">
                <WelcomeBanner
                    title={`Welcome back, ${firstName}!`}
                    subtitle={
                        branch
                            ? `${branch.name} is ${branch.status === 'ACTIVE' ? 'active' : 'disabled'}${branch.location ? ` · ${branch.location}` : ''
                            }.`
                            : 'Loading your branch...'
                    }
                    loading={loadingBranch || loadingSellers}
                    stats={[
                        { label: 'Sellers', value: sellerItems.length },
                        { label: 'Active sellers', value: activeSellers },
                        { label: 'Low stock', value: s?.low_stock ?? 0 },
                        { label: 'Out of stock', value: s?.out_of_stock ?? 0 },
                    ]}
                    actions={
                        <>
                            <Button asChild className="bg-white text-orange-700 hover:bg-orange-50">
                                <Link to="/branch-admin/sellers">
                                    <Plus className="mr-2 h-4 w-4" /> Add seller
                                </Link>
                            </Button>
                            <Button
                                asChild
                                variant="outline"
                                className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                            >
                                <Link to="/branch-admin/products">Manage products</Link>
                            </Button>
                        </>
                    }
                />
            </div>

            {/* Period switch */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="hidden sm:block">
                    <h2 className="text-lg font-semibold">{branchName}</h2>
                    <p className="text-sm text-muted-foreground">Trends compare with {compare}.</p>
                </div>
                <div
                    role="group"
                    aria-label="Report period"
                    className="grid w-full grid-cols-3 rounded-lg border bg-white p-1 sm:inline-flex sm:w-auto"
                >
                    {PERIODS.map((p) => (
                        <button
                            key={p.value}
                            type="button"
                            aria-pressed={period === p.value}
                            onClick={() => setPeriod(p.value)}
                            className={cn(
                                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                                period === p.value ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-orange-50'
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {isError ? (
                <div className="rounded-md border bg-white p-6 text-center">
                    <p className="mb-3 text-sm text-muted-foreground">Could not load the sales figures.</p>
                    <Button variant="outline" onClick={() => refetch()}>
                        Try again
                    </Button>
                </div>
            ) : (
                <>
                    {/* Phone only: revenue hero */}
                    <MobileHero
                        value={money(s?.revenue)}
                        change={s ? pctChange(s.revenue, s.previous.revenue) : null}
                        compare={compare}
                        salesCount={num(s?.sales_count)}
                        footer={`${activeSellers} of ${sellerItems.length} sellers active`}
                        loading={isFetching}
                    />

                    {/* Money */}
                    <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                        <StatCard
                            className="hidden sm:flex"
                            title="Total sales"
                            value={num(s?.sales_count)}
                            icon={Receipt}
                            tone="orange"
                            loading={isFetching}
                            change={s ? pctChange(s.sales_count, s.previous.sales_count) : null}
                        />
                        <StatCard
                            className="hidden sm:flex"
                            title="Revenue"
                            value={money(s?.revenue)}
                            icon={Banknote}
                            tone="sky"
                            loading={isFetching}
                            change={s ? pctChange(s.revenue, s.previous.revenue) : null}
                        />
                        <StatCard
                            title="Cost"
                            value={money(s?.cost)}
                            compactValue={moneyShort(s?.cost)}
                            icon={Coins}
                            tone="rose"
                            upIsGood={false}
                            loading={isFetching}
                            change={s ? pctChange(s.cost, s.previous.cost) : null}
                        />
                        <StatCard
                            title="Profit"
                            value={money(s?.profit)}
                            compactValue={moneyShort(s?.profit)}
                            icon={PiggyBank}
                            tone="emerald"
                            loading={isFetching}
                            change={s ? pctChange(s.profit, s.previous.profit) : null}
                            hint={margin !== null ? `${margin.toFixed(1)}% margin` : undefined}
                        />
                    </section>

                    {/* Stock (current position, so no period trend) */}
                    <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                        <StatCard title="Total products" value={num(s?.total_products)} icon={Package} tone="violet" loading={isFetching} />
                        <StatCard
                            title="Inventory value"
                            value={money(s?.inventory_value)}
                            compactValue={moneyShort(s?.inventory_value)}
                            icon={Warehouse}
                            tone="sky"
                            loading={isFetching}
                        />
                        <StatCard title="Low stock" value={num(s?.low_stock)} icon={TriangleAlert} tone="amber" loading={isFetching} />
                        <StatCard title="Out of stock" value={num(s?.out_of_stock)} icon={PackageX} tone="rose" loading={isFetching} />
                    </section>
                </>
            )}

            {/* Sales trend for this branch (the branch-split donut is not needed here) */}
            <SalesChart branchId={branchId} />

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">Latest sellers</CardTitle>
                        <Link to="/branch-admin/sellers" className="text-sm font-medium text-orange-600 hover:underline">
                            View all
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {loadingSellers ? (
                            <Skeleton className="h-28 w-full" />
                        ) : recentSellers.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No sellers yet. Add your first seller to get started.</p>
                        ) : (
                            <ul className="divide-y">
                                {recentSellers.map((u) => (
                                    <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">{u.full_name}</p>
                                            <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                                        </div>
                                        <StatusBadge status={u.status} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Needs attention</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Link
                            to="/branch-admin/products?stock=low"
                            className="flex items-center justify-between rounded-lg bg-amber-50 p-3 text-sm hover:bg-amber-100"
                        >
                            <span>Low stock products</span>
                            <span className="font-semibold text-amber-700">{num(s?.low_stock)}</span>
                        </Link>
                        <Link
                            to="/branch-admin/products?stock=out"
                            className="flex items-center justify-between rounded-lg bg-red-50 p-3 text-sm hover:bg-red-100"
                        >
                            <span>Out of stock products</span>
                            <span className="font-semibold text-red-700">{num(s?.out_of_stock)}</span>
                        </Link>
                        <Link
                            to="/branch-admin/sellers"
                            className="flex items-center justify-between rounded-lg bg-zinc-50 p-3 text-sm hover:bg-zinc-100"
                        >
                            <span>Suspended sellers</span>
                            <span className="font-semibold text-zinc-700">{suspendedSellers}</span>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
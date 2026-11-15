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
import { useAppSelector } from '@/app/hooks';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import { useGetSummaryQuery } from '@/features/reports/reportsApi';
import { useGetUsersQuery } from '@/features/users/usersApi';
import BranchDonut from '@/components/BranchDonut';
import SalesChart from '@/components/SalesChart';
import { formatCount, formatMoney, formatMoneyCompact, pctChange } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ReportPeriod } from '@/types';

const PERIODS: { value: ReportPeriod; label: string; compare: string }[] = [
  { value: 'today', label: 'Today', compare: 'yesterday' },
  { value: 'week', label: 'This week', compare: 'last week' },
  { value: 'month', label: 'This month', compare: 'last month' },
];

export default function Dashboard() {
  const user = useAppSelector((s) => s.auth.user);
  const [period, setPeriod] = useState<ReportPeriod>('month');

  const { data: branches = [], isLoading: loadingBranches } = useGetBranchesQuery();
  const { data: admins, isLoading: loadingAdmins } = useGetUsersQuery({ role: 'BRANCH_ADMIN' });
  const { data: s, isFetching, isError, refetch } = useGetSummaryQuery({ period });

  const adminItems = admins?.items ?? [];
  const activeBranches = branches.filter((b) => b.status === 'ACTIVE').length;
  const activeAdmins = adminItems.filter((a) => a.status === 'ACTIVE').length;
  const disabledBranches = branches.length - activeBranches;
  const suspendedAdmins = adminItems.filter((a) => a.status === 'SUSPENDED').length;
  const recent = branches.slice(-5).reverse();
  const firstName = user?.full_name.split(' ')[0] ?? '';

  const compare = PERIODS.find((p) => p.value === period)?.compare ?? '';
  const margin = s && s.revenue > 0 ? (s.profit / s.revenue) * 100 : null;
  const money = (n?: number) => (s && n !== undefined ? formatMoney(n) : '-');
  const moneyShort = (n?: number) => (s && n !== undefined ? formatMoneyCompact(n) : '-');
  const num = (n?: number) => (s && n !== undefined ? formatCount(n) : '-');

  return (
    <div className="space-y-5 md:space-y-3">
      <h1 className="text-xl font-semibold md:hidden">Dashboard</h1>

      {/* Desktop and tablet: welcome banner */}
      <div className="hidden md:block">
        <WelcomeBanner
          title={`Welcome back, ${firstName}!`}
          subtitle={`${activeBranches} of ${branches.length} branches are active today.`}
          loading={loadingBranches || loadingAdmins}
          stats={[
            { label: 'Branches', value: branches.length },
            { label: 'Active', value: activeBranches },
            { label: 'Admins', value: adminItems.length },
            { label: 'Active admins', value: activeAdmins },
          ]}
          actions={
            <>
              <Button asChild className="bg-white text-orange-700 hover:bg-orange-50">
                <Link to="/super-admin/branches">
                  <Plus className="mr-2 h-4 w-4" /> Add branch
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Link to="/super-admin/branch-admins">Manage admins</Link>
              </Button>
            </>
          }
        />
      </div>

      {/* Period switch */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="hidden sm:block">
          <h2 className="text-lg font-semibold">All branches</h2>
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
          {/* Phone only: revenue hero (replaces the Revenue and Total sales cards) */}
          <MobileHero
            value={money(s?.revenue)}
            change={s ? pctChange(s.revenue, s.previous.revenue) : null}
            compare={compare}
            salesCount={num(s?.sales_count)}
            footer={`${activeBranches} of ${branches.length} branches active`}
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

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesChart />
        </div>
        <BranchDonut period={period} periodLabel={PERIODS.find((p) => p.value === period)?.label ?? ''} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Latest branches</CardTitle>
            <Link to="/super-admin/branches" className="text-sm font-medium text-orange-600 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {loadingBranches ? (
              <Skeleton className="h-28 w-full" />
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No branches yet. Add your first branch to get started.</p>
            ) : (
              <ul className="divide-y">
                {recent.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{b.location}</p>
                    </div>
                    <StatusBadge status={b.status} />
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
              to="/super-admin/branches"
              className="flex items-center justify-between rounded-lg bg-amber-50 p-3 text-sm hover:bg-amber-100"
            >
              <span>Disabled branches</span>
              <span className="font-semibold text-amber-700">{disabledBranches}</span>
            </Link>
            <Link
              to="/super-admin/branch-admins"
              className="flex items-center justify-between rounded-lg bg-red-50 p-3 text-sm hover:bg-red-100"
            >
              <span>Suspended admins</span>
              <span className="font-semibold text-red-700">{suspendedAdmins}</span>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
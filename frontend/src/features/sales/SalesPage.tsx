import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Ban, Banknote, Clock, Coins, Hourglass,
  PiggyBank, Receipt, RotateCcw, Search,
  Wallet, Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import { useGetUsersQuery } from '@/features/users/usersApi';
import { useBranchScope } from '@/hooks/use-branch-scope';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatCount, formatDateTime, formatMoney, formatMoneyCompact } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/roles';
import { formatDay, formatRange, isOverdue, methodLabel } from '@/lib/sales';
import { cn } from '@/lib/utils';
import type { SalesPeriod } from '@/types';
import { PaymentStatusBadge, SaleStatusBadge } from './SaleBadges';
import { useGetSalesOverviewQuery } from './salesApi';
import { useSalesFilters } from './useSalesFilters';

const PAGE_SIZE = 20;

const PERIOD_CHIPS: { value: SalesPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

interface Props {
  /** "/super-admin/sales" or "/branch-admin/sales". Optional: it is read from the URL when omitted. */
  basePath?: string;
}

function FilterSelect({
  allLabel,
  value,
  onChange,
  options,
  className = 'w-44',
}: {
  allLabel: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value || 'all'} onValueChange={(v) => onChange(v === 'all' ? '' : v)}>
      <SelectTrigger className={className} aria-label={allLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function SalesPage({ basePath: basePathProp }: Props) {
  const location = useLocation();
  const basePath = basePathProp ?? location.pathname.replace(/\/+$/, '');

  // Super admin: any branch. Branch admin: locked to their own branch (the server enforces it too).
  const { isSuperAdmin, lockedBranchId, missingBranch } = useBranchScope();
  const showBranch = isSuperAdmin;

  const { filters, update, reset, isCustom, isFiltered } = useSalesFilters();

  // Search: type freely, update the URL (and the request) 300 ms after the last key
  const [qInput, setQInput] = useState(filters.q);
  const debouncedQ = useDebouncedValue(qInput, 300);
  useEffect(() => {
    if (debouncedQ.trim() !== filters.q) update({ q: debouncedQ.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const { data, isLoading, isFetching, isError, refetch } = useGetSalesOverviewQuery(
    {
      period: filters.period,
      date_from: filters.from || undefined,
      date_to: filters.to || undefined,
      created_by: filters.staff || undefined,
      // the locked branch always wins over anything typed in the URL
      branch_id: lockedBranchId ?? (filters.branch || undefined),
      payment_method: filters.method || undefined,
      payment_status: filters.pay || undefined,
      status: filters.status || undefined,
      search: filters.q || undefined,
      skip: filters.page * PAGE_SIZE,
      limit: PAGE_SIZE,
    },
    // no branch on the account: the API would answer 403, so do not ask
    { refetchOnMountOrArgChange: true, skip: missingBranch }
  );

  const { data: users } = useGetUsersQuery({ limit: 200 });
  const { data: branches = [] } = useGetBranchesQuery();

  const staffOptions = (users?.items ?? []).map((u) => ({
    value: u.id,
    label: `${u.full_name} (${ROLE_LABEL[u.role]})`,
  }));
  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));
  const methodCodes = new Set(data?.methods ?? []);
  if (filters.method) methodCodes.add(filters.method); // keep the chosen one visible while loading
  const methodOptions = [...methodCodes].map((m) => ({ value: m, label: methodLabel(m) }));

  const s = data?.summary;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : filters.page * PAGE_SIZE + 1;
  const to = Math.min(total, (filters.page + 1) * PAGE_SIZE);
  const margin = s && s.revenue > 0 ? (s.profit / s.revenue) * 100 : null;

  const money = (n?: number) => (s && n !== undefined ? formatMoney(n) : '-');
  const short = (n?: number) => (s && n !== undefined ? formatMoneyCompact(n) : '-');
  const num = (n?: number) => (s && n !== undefined ? formatCount(n) : '-');

  const clearAll = () => {
    setQInput('');
    reset();
  };

  // A branch admin or seller whose account has no branch yet
  if (missingBranch) {
    return (
      <div className="space-y-4">
        <PageHeader title="Sales" />
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your account is not assigned to a branch yet, so there are no sales to show. Ask a super admin to assign
          you to a branch.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales"
        description={`${formatRange(data?.window_start, data?.window_end)} - ${total} ${total === 1 ? 'sale' : 'sales'} in the list`}
        action={
          <Button asChild className="bg-orange-600 hover:bg-orange-700">
            <Link to={`${basePath}/new`}>
              <Plus className="mr-2 h-4 w-4" /> New sale
            </Link>
          </Button>
        }
      />


      {/* Period */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Period" className="flex flex-wrap gap-1 rounded-lg border bg-white p-1">
          {PERIOD_CHIPS.map((p) => {
            const active = !isCustom && filters.period === p.value;
            return (
              <button
                key={p.value}
                type="button"
                aria-pressed={active}
                onClick={() => update({ period: p.value, from: '', to: '' })}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                  active ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-orange-50'
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2" role="group" aria-label="Custom date range">
          <Input
            type="date"
            aria-label="From date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => update({ from: e.target.value })}
            className={cn('w-40', isCustom && 'border-orange-600')}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => update({ to: e.target.value })}
            className={cn('w-40', isCustom && 'border-orange-600')}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[15rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            aria-label="Search by sale number"
            placeholder="Sale number"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="pl-9"
          />
        </div>

        <FilterSelect allLabel="All staff" value={filters.staff} onChange={(v) => update({ staff: v })} options={staffOptions} />
        {showBranch && (
          <FilterSelect allLabel="All branches" value={filters.branch} onChange={(v) => update({ branch: v })} options={branchOptions} />
        )}
        <FilterSelect allLabel="Any payment method" value={filters.method} onChange={(v) => update({ method: v })} options={methodOptions} className="w-48" />
        <FilterSelect
          allLabel="Any payment status"
          value={filters.pay}
          onChange={(v) => update({ pay: v as typeof filters.pay })}
          options={[
            { value: 'PAID', label: 'Paid' },
            { value: 'PARTIAL', label: 'Partly paid' },
            { value: 'UNPAID', label: 'Unpaid (credit)' },
          ]}
          className="w-48"
        />
        <FilterSelect
          allLabel="Completed and voided"
          value={filters.status}
          onChange={(v) => update({ status: v as typeof filters.status })}
          options={[
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'VOIDED', label: 'Voided' },
          ]}
          className="w-52"
        />

        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> Reset
          </Button>
        )}
      </div>

      {isError ? (
        <div className="rounded-md border bg-white p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">Could not load sales.</p>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {/* Summary: always completed sales, whatever the status filter says */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard title="Sales" value={num(s?.sales_count)} icon={Receipt} tone="orange" loading={isLoading} />
            <StatCard title="Revenue" value={money(s?.revenue)} compactValue={short(s?.revenue)} icon={Banknote} tone="sky" loading={isLoading} />
            <StatCard
              title="Profit"
              value={money(s?.profit)}
              compactValue={short(s?.profit)}
              icon={PiggyBank}
              tone="emerald"
              loading={isLoading}
              hint={margin !== null ? `${margin.toFixed(1)}% margin` : undefined}
            />
            <StatCard title="Cost" value={money(s?.cost)} compactValue={short(s?.cost)} icon={Coins} tone="rose" loading={isLoading} />
            <StatCard title="Collected" value={money(s?.paid)} compactValue={short(s?.paid)} icon={Wallet} tone="emerald" loading={isLoading} />
            <StatCard title="Outstanding" value={money(s?.balance_due)} compactValue={short(s?.balance_due)} icon={Hourglass} tone="amber" loading={isLoading} />
            <StatCard
              title="Overdue"
              value={money(s?.overdue_amount)}
              compactValue={short(s?.overdue_amount)}
              icon={Clock}
              tone="rose"
              loading={isLoading}
              hint={s ? `${s.overdue_count} ${s.overdue_count === 1 ? 'sale' : 'sales'}` : undefined}
            />
            <StatCard
              title="Voided"
              value={num(s?.voided_count)}
              icon={Ban}
              tone="violet"
              loading={isLoading}
              hint={s && s.voided_count > 0 ? formatMoney(s.voided_total) : undefined}
            />
          </section>

          {s && s.by_method.length > 0 && (
            <Card className="gap-0 py-0">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
                <p className="text-sm font-medium">Collected by method</p>
                {s.by_method.map((m) => (
                  <div key={m.method} className="flex items-baseline gap-2 text-sm">
                    <span className="text-muted-foreground">{methodLabel(m.method)}</span>
                    <span className="font-semibold tabular-nums">{formatMoney(m.total)}</span>
                    <span className="text-xs text-muted-foreground">({m.count})</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="gap-0 py-0">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="mb-3 text-sm text-muted-foreground">
                    {filters.page > 0
                      ? 'There are no sales on this page.'
                      : isFiltered
                        ? 'No sales match these filters.'
                        : 'No sales in this period yet.'}
                  </p>
                  {filters.page > 0 ? (
                    <Button variant="outline" onClick={() => update({ page: 0 })}>
                      Go to page 1
                    </Button>
                  ) : (
                    isFiltered && (
                      <Button variant="outline" onClick={clearAll}>
                        Reset filters
                      </Button>
                    )
                  )}
                </div>
              ) : (
                <div className={cn('overflow-x-auto', isFetching && 'opacity-60')}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sale</TableHead>
                        <TableHead>Staff</TableHead>
                        <TableHead>Customer</TableHead>
                        {showBranch && <TableHead>Branch</TableHead>}
                        <TableHead className="text-right">Items</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Due</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((r) => {
                        const voided = String(r.status).toUpperCase() === 'VOIDED';
                        const overdue = isOverdue(r.status, r.balance_due, r.due_date);
                        return (
                          <TableRow key={r.id} className={cn(voided && 'text-muted-foreground')}>
                            <TableCell className="whitespace-nowrap">
                              <Link
                                to={`${basePath}/${r.id}`}
                                state={{ from: location.search }}
                                className="font-mono text-sm font-medium hover:text-orange-600"
                              >
                                {r.sale_number}
                              </Link>
                              <p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
                            </TableCell>
                            <TableCell className="text-sm">{r.staff_name ?? '-'}</TableCell>
                            <TableCell className="text-sm">{r.customer_name ?? 'Walk-in'}</TableCell>
                            {showBranch && <TableCell className="text-sm">{r.branch_name ?? '-'}</TableCell>}
                            <TableCell className="text-right text-sm tabular-nums">
                              {r.items_count}
                              <span className="text-xs text-muted-foreground"> ({r.units} units)</span>
                            </TableCell>
                            <TableCell className={cn('text-right font-medium tabular-nums', voided && 'line-through')}>
                              {formatMoney(r.total)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(r.amount_paid)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.balance_due > 0 ? (
                                <span className={overdue ? 'font-medium text-red-700' : 'text-amber-700'}>
                                  {formatMoney(r.balance_due)}
                                  {r.due_date && (
                                    <span className="block text-xs font-normal">
                                      {overdue ? 'Overdue since' : 'Due'} {formatDay(r.due_date)}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-emerald-700">
                              {voided ? '-' : formatMoney(r.profit)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-1">
                                <SaleStatusBadge status={r.status} />
                                {!voided && (
                                  <span className="flex items-center gap-1.5">
                                    <PaymentStatusBadge status={r.payment_status} />
                                    <span className="text-xs text-muted-foreground">{methodLabel(r.payment_method)}</span>
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button asChild variant="outline" size="sm">
                                <Link to={`${basePath}/${r.id}`} state={{ from: location.search }}>
                                  View
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Showing {from}-{to} of {total}
              </p>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Page {filters.page + 1} of {pageCount}
                  </span>
                  <Button variant="outline" size="sm" disabled={filters.page === 0} onClick={() => update({ page: filters.page - 1 })}>
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={filters.page + 1 >= pageCount}
                    onClick={() => update({ page: filters.page + 1 })}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
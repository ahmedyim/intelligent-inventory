import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Banknote, Hourglass, Plus, Receipt, RotateCcw, Search, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import FilterSelect from '@/components/FilterSelect';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { PERIOD_CHIPS } from '@/features/reports/reportDefs';
import { PaymentStatusBadge } from '@/features/sales/SaleBadges';
import { useSalesFilters } from '@/features/sales/useSalesFilters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatCount, formatDateTime, formatMoney, formatMoneyCompact } from '@/lib/format';
import { formatDay, formatRange, isOverdue, methodLabel } from '@/lib/sales';
import { cn } from '@/lib/utils';
import RefundSaleDialog from './RefundSaleDialog';
import SaleStatePill from './SaleStatePill';
import { useGetMySalesQuery } from './sellerApi';

const PAGE_SIZE = 20;

export default function MySalesPage() {
    const location = useLocation();
    const basePath = location.pathname.replace(/\/+$/, ''); // "/seller/sales"
    const { filters, update, reset, isCustom, isFiltered } = useSalesFilters();

    const [qInput, setQInput] = useState(filters.q);
    const debouncedQ = useDebouncedValue(qInput, 300);
    useEffect(() => {
        if (debouncedQ.trim() !== filters.q) update({ q: debouncedQ.trim() });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQ]);

    const [target, setTarget] = useState<{ id: string; number: string; paid: number } | null>(null);

    const { data, isLoading, isFetching, isError, refetch } = useGetMySalesQuery(
        {
            period: filters.period,
            date_from: filters.from || undefined,
            date_to: filters.to || undefined,
            payment_method: filters.method || undefined,
            payment_status: filters.pay || undefined,
            status: filters.status || undefined,
            search: filters.q || undefined,
            skip: filters.page * PAGE_SIZE,
            limit: PAGE_SIZE,
        },
        { refetchOnMountOrArgChange: true }
    );

    const s = data?.summary;
    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const from = total === 0 ? 0 : filters.page * PAGE_SIZE + 1;
    const to = Math.min(total, (filters.page + 1) * PAGE_SIZE);

    const methodCodes = new Set(data?.methods ?? []);
    if (filters.method) methodCodes.add(filters.method);
    const methodOptions = [...methodCodes].map((m) => ({ value: m, label: methodLabel(m) }));

    const money = (n?: number) => (s && n !== undefined ? formatMoney(n) : '-');
    const short = (n?: number) => (s && n !== undefined ? formatMoneyCompact(n) : '-');

    const clearAll = () => {
        setQInput('');
        reset();
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="My sales"
                description={`${formatRange(data?.window_start, data?.window_end)} - ${total} ${total === 1 ? 'sale' : 'sales'}`}
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
                    allLabel="Completed and refunded"
                    value={filters.status}
                    onChange={(v) => update({ status: v as typeof filters.status })}
                    options={[
                        { value: 'COMPLETED', label: 'Completed' },
                        { value: 'VOIDED', label: 'Refunded' },
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
                    <p className="mb-3 text-sm text-muted-foreground">Could not load your sales.</p>
                    <Button variant="outline" onClick={() => refetch()}>
                        Try again
                    </Button>
                </div>
            ) : (
                <>
                    <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                        <StatCard title="Sales" value={s ? formatCount(s.sales_count) : '-'} icon={Receipt} tone="orange" loading={isLoading} />
                        <StatCard title="Sold" value={money(s?.total)} compactValue={short(s?.total)} icon={Banknote} tone="sky" loading={isLoading} />
                        <StatCard title="Collected" value={money(s?.paid)} compactValue={short(s?.paid)} icon={Wallet} tone="emerald" loading={isLoading} />
                        <StatCard
                            title="On credit"
                            value={money(s?.balance_due)}
                            compactValue={short(s?.balance_due)}
                            icon={Hourglass}
                            tone="amber"
                            loading={isLoading}
                            hint={s && s.overdue_count > 0 ? `${s.overdue_count} overdue` : undefined}
                        />
                    </section>
                    {s && s.voided_count > 0 && (
                        <p className="text-sm text-muted-foreground">
                            Refunded: {s.voided_count} {s.voided_count === 1 ? 'sale' : 'sales'} ({formatMoney(s.voided_total)}). They
                            are not counted in the numbers above.
                        </p>
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
                                                : 'You have no sales in this period yet.'}
                                    </p>
                                    {filters.page > 0 ? (
                                        <Button variant="outline" onClick={() => update({ page: 0 })}>
                                            Go to page 1
                                        </Button>
                                    ) : isFiltered ? (
                                        <Button variant="outline" onClick={clearAll}>
                                            Reset filters
                                        </Button>
                                    ) : (
                                        <Button asChild className="bg-orange-600 hover:bg-orange-700">
                                            <Link to={`${basePath}/new`}>Make a sale</Link>
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className={cn('overflow-x-auto', isFetching && 'opacity-60')}>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Sale</TableHead>
                                                <TableHead>Customer</TableHead>
                                                <TableHead className="text-right">Items</TableHead>
                                                <TableHead className="text-right">Total</TableHead>
                                                <TableHead className="text-right">Paid</TableHead>
                                                <TableHead className="text-right">Due</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="w-40" />
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {items.map((r) => {
                                                const refunded = String(r.status).toUpperCase() === 'VOIDED';
                                                const overdue = isOverdue(r.status, r.balance_due, r.due_date);
                                                return (
                                                    <TableRow key={r.id} className={cn(refunded && 'text-muted-foreground')}>
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
                                                        <TableCell className="text-sm">{r.customer_name ?? 'Walk-in'}</TableCell>
                                                        <TableCell className="text-right text-sm tabular-nums">
                                                            {r.items_count}
                                                            <span className="text-xs text-muted-foreground"> ({r.units} units)</span>
                                                        </TableCell>
                                                        <TableCell className={cn('text-right font-medium tabular-nums', refunded && 'line-through')}>
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
                                                        <TableCell>
                                                            <div className="flex flex-col items-start gap-1">
                                                                <SaleStatePill status={r.status} />
                                                                {!refunded && (
                                                                    <span className="flex items-center gap-1.5">
                                                                        <PaymentStatusBadge status={r.payment_status} />
                                                                        <span className="text-xs text-muted-foreground">{methodLabel(r.payment_method)}</span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex justify-end gap-2">
                                                                <Button asChild variant="outline" size="sm">
                                                                    <Link to={`${basePath}/${r.id}`} state={{ from: location.search }}>
                                                                        View
                                                                    </Link>
                                                                </Button>
                                                                {r.can_refund && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
                                                                        onClick={() => setTarget({ id: r.id, number: r.sale_number, paid: r.amount_paid })}
                                                                    >
                                                                        Refund
                                                                    </Button>
                                                                )}
                                                            </div>
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
                                {data && ` - sellers can refund their own sales for ${data.refund_window_hours} hours`}
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

            {target && (
                <RefundSaleDialog
                    open
                    onOpenChange={(o) => !o && setTarget(null)}
                    saleId={target.id}
                    saleNumber={target.number}
                    paid={target.paid}
                />
            )}
        </div>
    );
}
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Hourglass, Package, Plus, Receipt, Undo2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSlice';
import { formatCount, formatDateTime, formatMoney, formatMoneyCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SalesPeriod } from '@/types';
import SaleStatePill from './SaleStatePill';
import { useGetMySalesQuery } from './sellerApi';

const PERIODS: { value: SalesPeriod; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
];

export default function SellerDashboard() {
    const user = useAppSelector(selectUser);
    const [period, setPeriod] = useState<SalesPeriod>('today');
    const { data, isLoading, isError, refetch } = useGetMySalesQuery({ period, limit: 5 }, { refetchOnMountOrArgChange: true });

    const s = data?.summary;
    const money = (n?: number) => (s && n !== undefined ? formatMoney(n) : '-');
    const short = (n?: number) => (s && n !== undefined ? formatMoneyCompact(n) : '-');
    const firstName = user?.full_name?.split(' ')[0] ?? '';

    return (
        <div className="space-y-5 md:space-y-6">
            <PageHeader title={`Hello, ${firstName}`} description="Here is how your sales are going." />

            <div className="grid gap-3 sm:grid-cols-3">
                <Button asChild className="h-12 bg-orange-600 text-base hover:bg-orange-700">
                    <Link to="/seller/sales/new">
                        <Plus className="mr-2 h-5 w-5" /> New sale
                    </Link>
                </Button>
                <Button asChild variant="outline" className="h-12 text-base">
                    <Link to="/seller/sales">
                        <Receipt className="mr-2 h-5 w-5" /> My sales
                    </Link>
                </Button>
                <Button asChild variant="outline" className="h-12 text-base">
                    <Link to="/seller/products">
                        <Package className="mr-2 h-5 w-5" /> Products
                    </Link>
                </Button>
            </div>

            <div role="group" aria-label="Period" className="grid w-full grid-cols-3 rounded-lg border bg-white p-1 sm:inline-flex sm:w-auto">
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
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Undo2 className="h-4 w-4" /> {s.voided_count} refunded ({formatMoney(s.voided_total)}), not counted above.
                        </p>
                    )}

                    <Card className="gap-0 py-0">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base">Latest sales</CardTitle>
                            <Link to="/seller/sales" className="text-sm font-medium text-orange-600 hover:underline">
                                View all
                            </Link>
                        </CardHeader>
                        <CardContent className="px-4 pb-2">
                            {isLoading ? (
                                <Skeleton className="mb-3 h-28 w-full" />
                            ) : (data?.items.length ?? 0) === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period yet.</p>
                            ) : (
                                <ul className="divide-y">
                                    {data?.items.map((r) => (
                                        <li key={r.id}>
                                            <Link to={`/seller/sales/${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-orange-600">
                                                <div className="min-w-0">
                                                    <p className="font-mono text-sm font-medium">{r.sale_number}</p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {formatDateTime(r.created_at)} - {r.customer_name ?? 'Walk-in'}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <SaleStatePill status={r.status} />
                                                    <span className="text-sm font-semibold tabular-nums">{formatMoney(r.total)}</span>
                                                </div>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
import { useMemo, type ReactNode } from 'react';
import { Building2, CalendarDays, Percent, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppSelector } from '@/app/hooks';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import type { ReportValue } from '@/types';
import { useGetReportTableQuery } from './reportTablesApi';

const num = (v: ReportValue | undefined) => Number(v) || 0;

const money = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// No branch_id is sent anywhere: the backend must lock a branch admin to their own branch.
const BASE = { period: undefined, branch_id: undefined, created_by: undefined, payment_method: undefined };

function Kpi({
    icon,
    label,
    value,
    hint,
    loading,
}: {
    icon: ReactNode;
    label: string;
    value: string;
    hint?: string;
    loading: boolean;
}) {
    return (
        <Card className="gap-0 py-0">
            <CardContent className="flex items-start gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-700">
                    {icon}
                </span>
                <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    {loading ? (
                        <Skeleton className="mt-1 h-7 w-28" />
                    ) : (
                        <p className="truncate text-xl font-semibold">{value}</p>
                    )}
                    {hint && !loading && <p className="text-xs text-muted-foreground">{hint}</p>}
                </div>
            </CardContent>
        </Card>
    );
}

export default function BranchSnapshot() {
    const user = useAppSelector((s) => s.auth.user);
    const { data: branches = [] } = useGetBranchesQuery();
    const branchName = branches.find((b) => b.id === user?.branch_id)?.name;

    const { today, monthStart, monthLabel } = useMemo(() => {
        const now = new Date();
        const iso = (d: Date) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD
        return {
            today: iso(now),
            monthStart: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
            monthLabel: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        };
    }, []);

    // "by-product" totals give the sales value and profit for the period.
    const todayQ = useGetReportTableQuery({
        key: 'by-product',
        ...BASE,
        date_from: today,
        date_to: today,
        skip: 0,
        limit: 1,
    });
    const monthQ = useGetReportTableQuery({
        key: 'by-product',
        ...BASE,
        date_from: monthStart,
        date_to: today,
        skip: 0,
        limit: 200,
    });

    const todaySales = num(todayQ.data?.totals?.sales_value);
    const monthSales = num(monthQ.data?.totals?.sales_value);
    const monthProfit = num(monthQ.data?.totals?.profit);
    const marginRaw = monthQ.data?.totals?.margin;
    const margin = marginRaw == null ? null : Number(marginRaw);

    // Top 5 products of the month by sales value.
    const top = useMemo(() => {
        const rows = [...(monthQ.data?.rows ?? [])]
            .map((r) => ({ name: String(r.product ?? '-'), value: num(r.sales_value) }))
            .filter((r) => r.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
        const max = rows[0]?.value ?? 0;
        return rows.map((r) => ({ ...r, pct: max ? Math.max(4, Math.round((r.value / max) * 100)) : 0 }));
    }, [monthQ.data]);

    const loading = monthQ.isLoading || todayQ.isLoading;

    return (
        <section aria-label="Branch snapshot" className="space-y-4">
            {/* Branch banner */}
            <Card className="gap-0 py-0">
                <CardContent className="flex items-center gap-3 p-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white">
                        <Building2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold">{branchName ?? 'Your branch'}</h1>
                        <p className="text-sm text-muted-foreground">
                            Branch reports. You only see the data of your own branch.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {monthQ.isError || todayQ.isError ? (
                <div className="rounded-md border bg-white p-4 text-center">
                    <p className="mb-3 text-sm text-muted-foreground">Could not load the branch snapshot.</p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            todayQ.refetch();
                            monthQ.refetch();
                        }}
                    >
                        Try again
                    </Button>
                </div>
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Kpi
                            icon={<CalendarDays className="h-5 w-5" />}
                            label="Sales today"
                            value={money(todaySales)}
                            loading={loading}
                        />
                        <Kpi
                            icon={<TrendingUp className="h-5 w-5" />}
                            label="Sales this month"
                            value={money(monthSales)}
                            hint={monthLabel}
                            loading={loading}
                        />
                        <Kpi
                            icon={<Wallet className="h-5 w-5" />}
                            label="Profit this month"
                            value={money(monthProfit)}
                            hint={monthLabel}
                            loading={loading}
                        />
                        <Kpi
                            icon={<Percent className="h-5 w-5" />}
                            label="Profit margin"
                            value={margin == null ? '-' : `${(margin * 100).toFixed(1)}%`}
                            hint="This month"
                            loading={loading}
                        />
                    </div>

                    <Card className="gap-0 py-0">
                        <div className="flex items-center gap-2 border-b p-4">
                            <Trophy className="h-4 w-4 text-orange-600" aria-hidden />
                            <h2 className="text-base font-semibold">Top products this month</h2>
                        </div>
                        <CardContent className="p-4">
                            {loading ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <Skeleton key={i} className="h-6 w-full" />
                                    ))}
                                </div>
                            ) : top.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No sales yet this month.</p>
                            ) : (
                                <ol className="space-y-3">
                                    {top.map((p, i) => (
                                        <li key={p.name} className="space-y-1">
                                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                                <span className="min-w-0 truncate font-medium">
                                                    {i + 1}. {p.name}
                                                </span>
                                                <span className="shrink-0 text-muted-foreground">{money(p.value)}</span>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-orange-100">
                                                <div className="h-full rounded-full bg-orange-500" style={{ width: `${p.pct}%` }} />
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </section>
    );
}
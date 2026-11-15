import { useMemo, useState } from 'react';
import {
    ChevronDown,
    Download,
    FileSpreadsheet,
    FileText,
    Loader2,
    RotateCcw,
    Search,
    TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import FilterSelect from '@/components/FilterSelect';
import PageHeader from '@/components/PageHeader';
import { useAppSelector } from '@/app/hooks';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import { useGetUsersQuery } from '@/features/users/usersApi';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/roles';
import { methodLabel } from '@/lib/sales';
import { cn } from '@/lib/utils';
import type { ReportKey, ReportQuery, ReportTable, ReportValue } from '@/types';
import { downloadReport } from './download';
import { PERIOD_CHIPS, REPORT_GROUPS, REPORTS } from './reportDefs';
import ReportTableView from './ReportTableView';
import { useGetReportTableQuery } from './reportTablesApi';
import { useReportFilters } from './useReportFilters';

const PAGE_SIZE = 25;
const CLIENT_LIMIT = 200; // the most rows the API returns in one request

// Reports with a product name / SKU column. They always load everything and are searched
// and paged in the browser. Every other report pages on the server until the person types
// in the search box; then it loads up to CLIENT_LIMIT rows and searches those.
const CLIENT_SEARCH: ReportKey[] = ['by-product', 'stock'];

type Row = Record<string, ReportValue>;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Product reports search the product name and SKU only. Other reports search every value in the row.
function matches(row: Row, words: string[], productOnly: boolean): boolean {
    const text = productOnly
        ? `${row.product ?? ''} ${row.sku ?? ''}`.toLowerCase()
        : Object.values(row)
            .map((v) => (v == null ? '' : String(v)))
            .join(' ')
            .toLowerCase();
    return words.every((w) => text.includes(w));
}

// The server totals cover the whole report. While searching, recompute them for the matches.
function totalsFor(table: ReportTable, rows: Row[]): Record<string, ReportValue> | null {
    if (!table.totals) return null;

    const out: Record<string, ReportValue> = {};
    for (const col of table.columns) {
        if (col.key in table.totals && (col.type === 'money' || col.type === 'int')) {
            out[col.key] = round2(rows.reduce((sum, r) => sum + (Number(r[col.key]) || 0), 0));
        }
    }
    if ('margin' in table.totals) {
        const revenue = Number(out.sales_value ?? 0);
        out.margin = revenue ? Number(out.profit ?? 0) / revenue : null;
    }
    out.product = table.key === 'stock' ? `${rows.length} stock lines` : `${rows.length} products`;
    return out;
}

export default function ReportsPage() {
    const user = useAppSelector((s) => s.auth.user);
    const showBranch = user?.role === 'SUPER_ADMIN';
    const { filters, update, resetFilters, isCustom, isFiltered } = useReportFilters();
    const def = REPORTS.find((r) => r.key === filters.report) ?? REPORTS[0];

    const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);
    const [search, setSearch] = useState('');

    const productReport = CLIENT_SEARCH.includes(filters.report);
    const needle = search.trim().toLowerCase();
    const searching = needle !== '';
    // Product reports are always handled in the browser; the others only while searching.
    const clientMode = productReport || searching;

    // Send only the filters this report understands
    const params: Omit<ReportQuery, 'key' | 'skip' | 'limit'> = {
        period: def.period ? filters.period : undefined,
        date_from: def.period && filters.from ? filters.from : undefined,
        date_to: def.period && filters.to ? filters.to : undefined,
        branch_id: def.branch && showBranch && filters.branch ? filters.branch : undefined,
        created_by: def.staff && filters.staff ? filters.staff : undefined,
        payment_method: def.method && filters.method ? filters.method : undefined,
    };

    // Browser-side reports load everything the API allows in one go; the rest page on the server
    const { data, isLoading, isFetching, isError, refetch } = useGetReportTableQuery(
        {
            key: filters.report,
            ...params,
            skip: clientMode ? 0 : filters.page * PAGE_SIZE,
            limit: clientMode ? CLIENT_LIMIT : PAGE_SIZE,
        },
        { refetchOnMountOrArgChange: true }
    );

    const { data: users } = useGetUsersQuery({ limit: 200 });
    const { data: branches = [] } = useGetBranchesQuery();

    const staffOptions = (users?.items ?? []).map((u) => ({ value: u.id, label: `${u.full_name} (${ROLE_LABEL[u.role]})` }));
    const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));
    const methodCodes = new Set(data?.methods ?? []);
    if (filters.method) methodCodes.add(filters.method);
    const methodOptions = [...methodCodes].map((m) => ({ value: m, label: methodLabel(m) }));

    // Rows after the search (browser side)
    const rows = useMemo<Row[]>(() => {
        if (!data) return [];
        if (!clientMode || needle === '') return data.rows;
        const words = needle.split(/\s+/);
        return data.rows.filter((r) => matches(r, words, productReport));
    }, [data, clientMode, needle, productReport]);

    // Paging
    const total = clientMode ? rows.length : (data?.total ?? 0);
    const perPage = clientMode ? PAGE_SIZE : (data?.limit ?? PAGE_SIZE);
    const pageCount = Math.max(1, Math.ceil(total / perPage));
    const page = clientMode ? Math.min(filters.page, pageCount - 1) : filters.page;
    const shown = clientMode ? rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : rows;
    const from = total === 0 ? 0 : page * perPage + 1;
    const to = Math.min(total, page * perPage + shown.length);

    // The table component gets a copy with the rows and totals for what is on screen.
    // Totals are recomputed for product reports; for the others they are hidden while
    // searching, because some totals (averages, for example) cannot be added up again.
    const view: ReportTable | null = data
        ? {
            ...data,
            rows: shown,
            skip: clientMode ? page * PAGE_SIZE : data.skip,
            totals: searching ? (productReport ? totalsFor(data, rows) : null) : data.totals,
        }
        : null;

    // The API returned fewer rows than exist, so the search cannot see all of them
    const partial = clientMode && !!data && data.total > data.rows.length;

    const noun = filters.report === 'stock' ? 'stock lines' : filters.report === 'by-product' ? 'products' : 'rows';

    const onSearch = (value: string) => {
        setSearch(value);
        if (filters.page !== 0) update({ page: 0 });
    };

    const reset = () => {
        setSearch('');
        resetFilters();
    };

    const exportAs = async (format: 'xlsx' | 'csv') => {
        const label = !def.period
            ? new Date().toLocaleDateString('en-CA')
            : filters.from || filters.to
                ? `${filters.from || 'start'}_to_${filters.to || 'today'}`
                : filters.period;
        setExporting(format);
        try {
            await downloadReport(
                `/reports/tables/${filters.report}/export`,
                { ...params, format },
                `${filters.report}-${label}.${format}`
            );
            toast.success(format === 'xlsx' ? 'Excel file downloaded' : 'CSV file downloaded');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not export the report');
        } finally {
            setExporting(null);
        }
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="Reports"
                description="Pick a report, set the filters, then export the full result."
                action={
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button className="bg-orange-600 hover:bg-orange-700" disabled={exporting !== null || isError}>
                                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                {exporting ? 'Preparing...' : 'Export'}
                                <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72">
                            <DropdownMenuLabel className="font-normal text-muted-foreground">
                                {searching ? 'Exports include all rows, not only the matches' : 'The whole report, not just this page'}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => exportAs('xlsx')} className="cursor-pointer">
                                <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" /> Excel (.xlsx)
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => exportAs('csv')} className="cursor-pointer">
                                <FileText className="mr-2 h-4 w-4 text-sky-600" /> CSV (for other tools)
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                }
            />

            {/* Report picker */}
            <div className="space-y-3">
                {REPORT_GROUPS.map((group) => (
                    <div key={group} className="flex flex-wrap items-center gap-2">
                        <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wider text-zinc-400">{group}</span>
                        {REPORTS.filter((r) => r.group === group).map((r) => (
                            <button
                                key={r.key}
                                type="button"
                                aria-pressed={filters.report === r.key}
                                onClick={() => {
                                    setSearch(''); // columns differ between reports, so start with an empty search
                                    update({ report: r.key });
                                }}
                                className={cn(
                                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                                    filters.report === r.key
                                        ? 'border-orange-600 bg-orange-600 text-white'
                                        : 'bg-white text-zinc-600 hover:bg-orange-50'
                                )}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
            <p className="text-sm text-muted-foreground">{def.description}</p>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                {def.period ? (
                    <>
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
                    </>
                ) : (
                    <p className="rounded-lg border bg-white px-3 py-2 text-sm text-muted-foreground">
                        This report shows the position right now, so the period does not apply.
                    </p>
                )}

                {/* Search: available on every report */}
                <div className="relative w-full max-w-[16rem]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                        type="search"
                        aria-label={productReport ? 'Search by product name or SKU' : 'Search this report'}
                        placeholder={productReport ? 'Product name or SKU' : 'Search this report'}
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        className={cn('pl-9', searching && 'border-orange-600')}
                    />
                </div>

                {def.branch && showBranch && (
                    <FilterSelect allLabel="All branches" value={filters.branch} onChange={(v) => update({ branch: v })} options={branchOptions} />
                )}
                {def.staff && (
                    <FilterSelect
                        allLabel={filters.report === 'payments' ? 'Anyone who received' : 'All staff'}
                        value={filters.staff}
                        onChange={(v) => update({ staff: v })}
                        options={staffOptions}
                    />
                )}
                {def.method && (
                    <FilterSelect allLabel="Any payment method" value={filters.method} onChange={(v) => update({ method: v })} options={methodOptions} className="w-48" />
                )}

                {(isFiltered || searching) && (
                    <Button variant="ghost" size="sm" onClick={reset}>
                        <RotateCcw className="mr-1.5 h-4 w-4" /> Reset
                    </Button>
                )}
            </div>

            {partial && data && (
                <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                        Showing the first {data.rows.length} of {data.total} lines, so the search only covers these.{' '}
                        {showBranch ? 'Choose a branch' : 'Choose a shorter period'} to narrow the list, or export for the
                        complete report.
                    </p>
                </div>
            )}

            {/* Result */}
            {isError ? (
                <div className="rounded-md border bg-white p-6 text-center">
                    <p className="mb-3 text-sm text-muted-foreground">Could not load this report.</p>
                    <Button variant="outline" onClick={() => refetch()}>
                        Try again
                    </Button>
                </div>
            ) : (
                <Card className="gap-0 py-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b p-4">
                        <h2 className="text-base font-semibold">{data?.title ?? def.label}</h2>
                        <p className="text-sm text-muted-foreground">
                            {data ? data.filters.join(' - ') : ''}
                            {searching && ` - search "${search.trim()}" (${rows.length} found)`}
                            {data && ` - generated ${formatDateTime(data.generated_at)}`}
                        </p>
                    </div>

                    <CardContent className="p-0">
                        {isLoading || !data || !view ? (
                            <div className="space-y-2 p-4">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <Skeleton key={i} className="h-10 w-full" />
                                ))}
                            </div>
                        ) : shown.length === 0 ? (
                            <div className="p-10 text-center">
                                <p className="mb-3 text-sm text-muted-foreground">
                                    {searching
                                        ? `No ${noun} match "${search.trim()}".`
                                        : page > 0
                                            ? 'Nothing on this page.'
                                            : 'No data for these filters.'}
                                </p>
                                {searching && (
                                    <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                                        Clear search
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <ReportTableView table={view} dimmed={isFetching} />
                        )}
                    </CardContent>
                </Card>
            )}

            {data && total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                        Showing {from}-{to} of {total} {total === 1 ? 'row' : 'rows'}
                        {!clientMode && total > 20000 && ' (exports include the first 20,000)'}
                    </p>
                    {pageCount > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                                Page {page + 1} of {pageCount}
                            </span>
                            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => update({ page: page - 1 })}>
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page + 1 >= pageCount}
                                onClick={() => update({ page: page + 1 })}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
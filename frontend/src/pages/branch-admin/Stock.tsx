import { useMemo, useState, type ReactNode } from 'react';
import {
    AlertTriangle,
    Boxes,
    ClipboardCheck,
    History,
    MoreHorizontal,
    PackageMinus,
    PackagePlus,
    PackageX,
    Search,
    SlidersHorizontal,
    TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from '@/components/PageHeader';
import { useAppSelector } from '@/app/hooks';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
    effectiveLevel,
    MovementsDialog,
    StockActionDialog,
    type StockMode,
    type StockRow,
} from '@/features/stock/StockDialogs';
// TODO: adjust this path if your inventory api file lives somewhere else.
import { useGetInventoryQuery } from '@/features/inventory/inventoryApi';

const PAGE_SIZE = 20;

type Status = 'out' | 'low' | 'ok';
type Filter = 'all' | 'low' | 'out';

// Same rule as the backend low-stock query (quantity <= branch level, else product default).
const statusOf = (i: StockRow): Status => {
    if (i.quantity <= 0) return 'out';
    const level = effectiveLevel(i);
    return level != null && i.quantity <= level ? 'low' : 'ok';
};

const RANK: Record<Status, number> = { out: 0, low: 1, ok: 2 }; // problems first

const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'low', label: 'Low stock' },
    { value: 'out', label: 'Out of stock' },
];

function StatusBadge({ status }: { status: Status }) {
    if (status === 'out') return <Badge variant="destructive">Out of stock</Badge>;
    if (status === 'low')
        return (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                Low stock
            </Badge>
        );
    return <Badge variant="secondary">In stock</Badge>;
}

function Kpi({
    icon,
    label,
    value,
    tone = 'orange',
    loading,
}: {
    icon: ReactNode;
    label: string;
    value: number;
    tone?: 'orange' | 'amber' | 'red';
    loading: boolean;
}) {
    const tones = {
        orange: 'bg-orange-100 text-orange-700',
        amber: 'bg-amber-100 text-amber-700',
        red: 'bg-red-100 text-red-700',
    };
    return (
        <Card className="gap-0 py-0">
            <CardContent className="flex items-center gap-3 p-4">
                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', tones[tone])}>{icon}</span>
                <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    {loading ? <Skeleton className="mt-1 h-7 w-12" /> : <p className="text-xl font-semibold">{value}</p>}
                </div>
            </CardContent>
        </Card>
    );
}

export default function BranchStock() {
    const user = useAppSelector((s) => s.auth.user);
    const branchId = user?.branch_id ?? '';

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [page, setPage] = useState(0);
    const [action, setAction] = useState<{ mode: StockMode; item: StockRow } | null>(null);
    const [history, setHistory] = useState<StockRow | null>(null);

    const { data, isLoading, isFetching, isError, refetch } = useGetInventoryQuery(
        { branch_id: branchId, skip: 0, limit: 200 },
        { skip: !branchId }
    );

    // The backend sends each row with its product (InventoryWithProduct).
    const items = useMemo(() => (data?.items ?? []) as unknown as StockRow[], [data]);
    const total = data?.total ?? 0;
    const partial = total > items.length;

    const counts = useMemo(() => {
        let low = 0;
        let out = 0;
        for (const i of items) {
            const s = statusOf(i);
            if (s === 'low') low++;
            if (s === 'out') out++;
        }
        return { low, out };
    }, [items]);

    const filtered = useMemo(() => {
        const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return items
            .filter((i) => {
                if (filter !== 'all' && statusOf(i) !== filter) return false;
                const text = `${i.product.name} ${i.product.sku}`.toLowerCase();
                return words.every((w) => text.includes(w));
            })
            .sort((a, b) => RANK[statusOf(a)] - RANK[statusOf(b)] || a.product.name.localeCompare(b.product.name));
    }, [items, search, filter]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const current = Math.min(page, pageCount - 1);
    const shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
    const from = filtered.length === 0 ? 0 : current * PAGE_SIZE + 1;
    const to = current * PAGE_SIZE + shown.length;
    const hasFilters = search.trim() !== '' || filter !== 'all';

    if (!branchId) {
        return (
            <div className="rounded-md border bg-white p-8 text-center">
                <p className="text-sm text-muted-foreground">
                    Your account is not assigned to a branch, so there is no stock to show. Ask the super admin to assign you.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Stock"
                description="The stock of your branch. Receive deliveries, remove damaged items and count the shelves."
            />

            <div className="grid gap-3 sm:grid-cols-3">
                <Kpi icon={<Boxes className="h-5 w-5" />} label="Products in stock list" value={total} loading={isLoading} />
                <Kpi
                    icon={<AlertTriangle className="h-5 w-5" />}
                    label="Low stock"
                    value={counts.low}
                    tone="amber"
                    loading={isLoading}
                />
                <Kpi
                    icon={<PackageX className="h-5 w-5" />}
                    label="Out of stock"
                    value={counts.out}
                    tone="red"
                    loading={isLoading}
                />
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                        type="search"
                        aria-label="Search stock"
                        placeholder="Product name or SKU"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(0);
                        }}
                        className="pl-9"
                    />
                </div>

                <div role="group" aria-label="Filter by stock level" className="inline-flex rounded-lg border bg-white p-1">
                    {FILTERS.map((f) => (
                        <button
                            key={f.value}
                            type="button"
                            aria-pressed={filter === f.value}
                            onClick={() => {
                                setFilter(f.value);
                                setPage(0);
                            }}
                            className={cn(
                                'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                                filter === f.value ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-orange-50'
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {partial && (
                <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                        Showing the first {items.length} of {total} products, so the search and the counts only cover these.
                    </p>
                </div>
            )}

            <Card className="gap-0 py-0">
                <CardContent className="p-0">
                    {isError ? (
                        <div className="p-6 text-center">
                            <p className="mb-3 text-sm text-muted-foreground">Could not load the stock.</p>
                            <Button variant="outline" onClick={() => refetch()}>
                                Try again
                            </Button>
                        </div>
                    ) : isLoading ? (
                        <div className="space-y-2 p-4">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : shown.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="mb-3 text-sm text-muted-foreground">
                                {hasFilters ? 'No products match these filters.' : 'There is no stock for your branch yet.'}
                            </p>
                            {hasFilters && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSearch('');
                                        setFilter('all');
                                        setPage(0);
                                    }}
                                >
                                    Clear filters
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className={cn('overflow-x-auto', isFetching && 'opacity-60')}>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Reorder level</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Last counted</TableHead>
                                        <TableHead className="w-32" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {shown.map((i) => {
                                        const status = statusOf(i);
                                        return (
                                            <TableRow key={i.id}>
                                                <TableCell>
                                                    <p className="font-medium">{i.product.name}</p>
                                                    <p className="text-xs text-muted-foreground">{i.product.sku}</p>
                                                </TableCell>
                                                <TableCell
                                                    className={cn(
                                                        'text-right font-semibold',
                                                        status === 'out' && 'text-red-700',
                                                        status === 'low' && 'text-amber-700'
                                                    )}
                                                >
                                                    {i.quantity}
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground">{effectiveLevel(i) ?? '-'}</TableCell>
                                                <TableCell>
                                                    <StatusBadge status={status} />
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                                    {i.last_counted_at ? timeAgo(i.last_counted_at) : 'Never'}
                                                </TableCell>
                                                <TableCell className="space-x-1 whitespace-nowrap text-right">
                                                    <Button size="sm" variant="outline" onClick={() => setAction({ mode: 'receive', item: i })}>
                                                        <PackagePlus className="mr-1 h-4 w-4" /> Receive
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button size="icon" variant="ghost" aria-label={`More actions for ${i.product.name}`}>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                className="cursor-pointer"
                                                                onSelect={() => setAction({ mode: 'issue', item: i })}
                                                            >
                                                                <PackageMinus className="mr-2 h-4 w-4" /> Remove stock
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="cursor-pointer"
                                                                onSelect={() => setAction({ mode: 'adjust', item: i })}
                                                            >
                                                                <ClipboardCheck className="mr-2 h-4 w-4" /> Count stock
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="cursor-pointer"
                                                                onSelect={() => setAction({ mode: 'reorder', item: i })}
                                                            >
                                                                <SlidersHorizontal className="mr-2 h-4 w-4" /> Reorder level
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="cursor-pointer" onSelect={() => setHistory(i)}>
                                                                <History className="mr-2 h-4 w-4" /> History
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
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

            {filtered.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                        Showing {from}-{to} of {filtered.length}
                    </p>
                    {pageCount > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                                Page {current + 1} of {pageCount}
                            </span>
                            <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={current + 1 >= pageCount}
                                onClick={() => setPage(current + 1)}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <StockActionDialog
                mode={action?.mode ?? null}
                item={action?.item ?? null}
                branchId={branchId}
                onClose={() => setAction(null)}
            />
            <MovementsDialog item={history} branchId={branchId} onClose={() => setHistory(null)} />
        </div>
    );
}
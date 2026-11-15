import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, RefreshCw, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ConfirmDialog from '@/components/ConfirmDialog';
import PageHeader from '@/components/PageHeader';
import ProductImage from '@/components/ProductImage';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import { useBranchScope } from '@/hooks/use-branch-scope';
import { getErrorMessage } from '@/lib/errors';
import { formatCount, parseApiDate, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Suggestion, SuggestionStatus } from '@/types';
import DecisionDialog, { type DecisionTarget } from './DecisionDialog';
import { useGetSuggestionsQuery, useRunForecastMutation } from './forecastApi';
import ForecastChartDialog from './ForecastChartDialog';
import { ConfidenceBadge, UrgencyBadge, URGENCY_LEVELS, urgencyLabel } from './SuggestionBadges';

const PAGE_SIZE = 20;

const ALL_STATUS_TABS: { value: SuggestionStatus; label: string }[] = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'DISMISSED', label: 'Dismissed' },
];

export default function ForecastPage() {
    const { role, isSuperAdmin, lockedBranchId, missingBranch } = useBranchScope();

    // Managers decide; sellers only look
    const canDecide = role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN';
    // Only managers have a product detail page
    const productBase =
        role === 'SUPER_ADMIN' ? '/super-admin/products' : role === 'BRANCH_ADMIN' ? '/branch-admin/products' : null;
    // Dismissed items are a manager's internal decision
    const statusTabs = canDecide ? ALL_STATUS_TABS : ALL_STATUS_TABS.filter((t) => t.value !== 'DISMISSED');

    // Only a super admin chooses a branch; everyone else is locked to theirs
    const { data: branches = [] } = useGetBranchesQuery(undefined, { skip: !isSuperAdmin });
    const activeBranches = useMemo(() => branches.filter((b) => b.status === 'ACTIVE'), [branches]);
    const [pickedBranch, setPickedBranch] = useState('');
    const branchId =
        lockedBranchId ?? (pickedBranch || (activeBranches.length === 1 ? (activeBranches[0]?.id ?? '') : ''));
    const where = (isSuperAdmin ? branches.find((b) => b.id === branchId)?.name : undefined) ?? 'your branch';

    const [status, setStatus] = useState<SuggestionStatus>('PENDING');
    const [urgency, setUrgency] = useState('');
    const [page, setPage] = useState(0);

    const [decision, setDecision] = useState<DecisionTarget | null>(null);
    const [chartFor, setChartFor] = useState<Suggestion | null>(null);
    const [runOpen, setRunOpen] = useState(false);

    const { data, isLoading, isFetching, isError, refetch } = useGetSuggestionsQuery(
        {
            branch_id: branchId,
            status,
            urgency: urgency || undefined,
            skip: page * PAGE_SIZE,
            limit: PAGE_SIZE,
        },
        { skip: !branchId, refetchOnMountOrArgChange: true }
    );
    const [runForecast] = useRunForecastMutation();

    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
    const to = Math.min(total, page * PAGE_SIZE + items.length);

    // Pending rows all come from the last run, so the newest timestamp is "last calculated"
    const lastRun = items.length
        ? items.reduce((a, b) => (parseApiDate(a.generated_at) > parseApiDate(b.generated_at) ? a : b)).generated_at
        : null;

    const resetPaging = () => setPage(0);

    const run = async () => {
        try {
            const res = await runForecast({ branch_id: branchId }).unwrap();
            toast.success(
                res.created === 0 ? 'Nothing needs reordering right now.' : `${res.created} reorder suggestions created.`
            );
            setStatus('PENDING');
            setUrgency('');
            resetPaging();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not recalculate the suggestions'));
            if ((err as { status?: number })?.status === 409) return; // "calculated a moment ago": just close
            throw err; // keeps the confirmation dialog open
        }
    };

    // A branch admin or seller whose account has no branch yet
    if (missingBranch) {
        return (
            <div className="space-y-4">
                <PageHeader title="Reorder suggestions" />
                <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Your account is not assigned to a branch yet, so there is nothing to show. Ask a super admin to assign you to
                    a branch.
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Reorder suggestions"
                description={
                    canDecide
                        ? 'What to order, based on recent sales and the stock on hand.'
                        : 'Products your branch should order soon. A manager decides and places the order.'
                }
                action={
                    canDecide ? (
                        <div className="flex flex-wrap items-center gap-2">
                            {isSuperAdmin && (
                                <Select
                                    value={branchId}
                                    onValueChange={(v) => {
                                        setPickedBranch(v);
                                        resetPaging();
                                    }}
                                >
                                    <SelectTrigger className="w-52" aria-label="Branch">
                                        <SelectValue placeholder="Select a branch" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {activeBranches.map((b) => (
                                            <SelectItem key={b.id} value={b.id}>
                                                {b.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            <Button
                                className="bg-orange-600 hover:bg-orange-700"
                                disabled={!branchId}
                                onClick={() => setRunOpen(true)}
                            >
                                <RefreshCw className="mr-2 h-4 w-4" /> Recalculate
                            </Button>
                        </div>
                    ) : undefined
                }
            />

            {!branchId ? (
                <p className="rounded-lg border bg-white p-10 text-center text-sm text-muted-foreground">
                    Choose a branch to see what it should reorder. Suggestions are calculated per branch.
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-3">
                        <div role="group" aria-label="Status" className="inline-flex rounded-lg border bg-white p-1">
                            {statusTabs.map((t) => (
                                <button
                                    key={t.value}
                                    type="button"
                                    aria-pressed={status === t.value}
                                    onClick={() => {
                                        setStatus(t.value);
                                        resetPaging();
                                    }}
                                    className={cn(
                                        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                                        status === t.value ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-orange-50'
                                    )}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        <Select
                            value={urgency || 'all'}
                            onValueChange={(v) => {
                                setUrgency(v === 'all' ? '' : v);
                                resetPaging();
                            }}
                        >
                            <SelectTrigger className="w-44" aria-label="Urgency">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any urgency</SelectItem>
                                {URGENCY_LEVELS.map((u) => (
                                    <SelectItem key={u} value={u}>
                                        {urgencyLabel(u)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {status === 'PENDING' && lastRun && (
                            <p className="text-sm text-muted-foreground">
                                Calculated {timeAgo(lastRun)} for {where}
                            </p>
                        )}
                    </div>

                    <Card className="gap-0 py-0">
                        <CardContent className="p-0">
                            {isError ? (
                                <div className="p-6 text-center">
                                    <p className="mb-3 text-sm text-muted-foreground">Could not load the suggestions.</p>
                                    <Button variant="outline" onClick={() => refetch()}>
                                        Try again
                                    </Button>
                                </div>
                            ) : isLoading ? (
                                <div className="space-y-2 p-4">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <Skeleton key={i} className="h-14 w-full" />
                                    ))}
                                </div>
                            ) : items.length === 0 ? (
                                <div className="p-10 text-center">
                                    <p className="mb-3 text-sm text-muted-foreground">
                                        {page > 0
                                            ? 'Nothing on this page.'
                                            : status === 'PENDING'
                                                ? canDecide
                                                    ? 'No pending suggestions. Stock may be healthy, or the forecast has not been run yet. Click Recalculate to check.'
                                                    : 'Nothing needs reordering right now.'
                                                : `No ${status.toLowerCase()} suggestions for ${where} yet.`}
                                    </p>
                                    {page > 0 && (
                                        <Button variant="outline" onClick={() => setPage(0)}>
                                            Go to page 1
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className={cn('overflow-x-auto', isFetching && 'opacity-60')}>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Product</TableHead>
                                                <TableHead className="text-right">In stock</TableHead>
                                                <TableHead className="text-right">Order</TableHead>
                                                <TableHead>Urgency</TableHead>
                                                <TableHead>Confidence</TableHead>
                                                <TableHead>Why</TableHead>
                                                <TableHead className={canDecide ? 'w-44' : 'w-16'} />
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {items.map((s) => {
                                                const p = s.product;
                                                const unit = p?.unit ?? 'units';
                                                // a link only exists for managers, and only when the API sent a product id
                                                const productHref = productBase && s.product_id ? `${productBase}/${s.product_id}` : null;

                                                const productCell = (
                                                    <>
                                                        <ProductImage src={p?.image_url} alt={p?.name ?? 'Product'} className="h-10 w-10" />
                                                        <div className="min-w-0">
                                                            <p className="truncate font-medium group-hover:text-orange-600">{p?.name ?? 'Product'}</p>
                                                            <p className="font-mono text-xs text-muted-foreground">{p?.sku ?? '-'}</p>
                                                        </div>
                                                    </>
                                                );

                                                return (
                                                    <TableRow key={s.id}>
                                                        <TableCell className="max-w-64">
                                                            {productHref ? (
                                                                <Link to={productHref} className="group flex items-center gap-3">
                                                                    {productCell}
                                                                </Link>
                                                            ) : (
                                                                <div className="flex items-center gap-3">{productCell}</div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">{formatCount(s.current_stock)}</TableCell>
                                                        <TableCell className="text-right font-semibold tabular-nums">
                                                            {formatCount(s.suggested_qty)}
                                                            <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <UrgencyBadge value={s.urgency} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <ConfidenceBadge value={s.confidence} />
                                                        </TableCell>
                                                        <TableCell className="max-w-72 text-sm text-zinc-600">
                                                            {s.reason}
                                                            {s.status !== 'PENDING' && (
                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                    {s.status === 'APPROVED' ? 'Approved' : 'Dismissed'} {timeAgo(s.decided_at)}
                                                                    {s.decision_note && ` - ${s.decision_note}`}
                                                                </p>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    title="Demand forecast"
                                                                    aria-label={`Demand forecast for ${p?.name ?? 'product'}`}
                                                                    disabled={!s.product_id}
                                                                    onClick={() => setChartFor(s)}
                                                                >
                                                                    <TrendingUp className="h-4 w-4" />
                                                                </Button>

                                                                {canDecide && s.status === 'PENDING' && (
                                                                    <>
                                                                        <Button
                                                                            size="sm"
                                                                            className="bg-orange-600 hover:bg-orange-700"
                                                                            onClick={() => setDecision({ suggestion: s, mode: 'approve' })}
                                                                        >
                                                                            <Check className="mr-1 h-4 w-4" /> Approve
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            title="Dismiss"
                                                                            aria-label={`Dismiss ${p?.name ?? 'suggestion'}`}
                                                                            onClick={() => setDecision({ suggestion: s, mode: 'dismiss' })}
                                                                        >
                                                                            <X className="h-4 w-4" />
                                                                        </Button>
                                                                    </>
                                                                )}

                                                                {canDecide && s.status === 'APPROVED' && productHref && (
                                                                    <Button asChild variant="outline" size="sm">
                                                                        <Link to={productHref}>Open product</Link>
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
                            </p>
                            {pageCount > 1 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">
                                        Page {page + 1} of {pageCount}
                                    </span>
                                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                                        Previous
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                                        Next
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {canDecide && (
                <>
                    <ConfirmDialog
                        open={runOpen}
                        onOpenChange={setRunOpen}
                        title="Recalculate suggestions?"
                        description={`This looks at recent sales and stock in ${where} and replaces its pending suggestions with new ones. Approved and dismissed suggestions are kept as history. It can take a few seconds.`}
                        confirmLabel="Recalculate"
                        onConfirm={run}
                    />
                    <DecisionDialog target={decision} onClose={() => setDecision(null)} onStale={() => refetch()} />
                </>
            )}

            <ForecastChartDialog key={chartFor?.id} suggestion={chartFor} onClose={() => setChartFor(null)} />
        </div>
    );
}
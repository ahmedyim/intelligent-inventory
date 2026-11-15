import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useGetUsersQuery } from '@/features/users/usersApi';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Branch, MovementType } from '@/types';
import { useGetProductMovementsQuery } from './productDetailApi';

const PAGE_SIZE = 15;

const TYPE_TABS: { value: 'all' | MovementType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'IN', label: 'Stock in' },
  { value: 'OUT', label: 'Stock out' },
  { value: 'ADJUSTMENT', label: 'Adjustments' },
];

const TYPE_STYLE: Record<string, string> = {
  IN: 'bg-emerald-50 text-emerald-700',
  OUT: 'bg-red-50 text-red-700',
  ADJUSTMENT: 'bg-amber-50 text-amber-700',
};
const TYPE_LABEL: Record<string, string> = { IN: 'In', OUT: 'Out', ADJUSTMENT: 'Adjustment' };

const REASONS: Record<string, string> = {
  purchase: 'Purchase',
  initial_stock: 'Opening stock',
  sale: 'Sale',
  sale_void: 'Sale voided',
  stock_count: 'Stock count',
  damage: 'Damage',
  loss: 'Loss',
  expired: 'Expired',
  other: 'Other',
};
const reasonLabel = (r: string) =>
  REASONS[r] ?? r.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

interface Props {
  productId: string;
  branches: Branch[];
}

export default function MovementHistory({ productId, branches }: Props) {
  const [type, setType] = useState<'all' | MovementType>('all');
  const [branch, setBranch] = useState('all');
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching, isError, refetch } = useGetProductMovementsQuery(
    {
      product_id: productId,
      branch_id: branch === 'all' ? undefined : branch,
      movement_type: type === 'all' ? undefined : type,
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    },
    { refetchOnMountOrArgChange: true }
  );

  // Show who made each movement (the list is small: one company's staff)
  const { data: users } = useGetUsersQuery({ limit: 200 });
  const staff = useMemo(() => new Map((users?.items ?? []).map((u) => [u.id, u.full_name])), [users]);
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-base font-semibold">Movement history</h2>
          <p className="text-sm text-muted-foreground">Every change to this product's stock, newest first.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Filter by type" className="inline-flex rounded-lg border bg-white p-1">
            {TYPE_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={type === t.value}
                onClick={() => {
                  setType(t.value);
                  setPage(0);
                }}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                  type === t.value ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-orange-50'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {branches.length > 1 && (
            <Select
              value={branch}
              onValueChange={(v) => {
                setBranch(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-44" aria-label="Filter by branch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {isError ? (
        <div className="border-t p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">Could not load the movement history.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2 border-t p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="border-t p-8 text-center text-sm text-muted-foreground">
          {page > 0 ? 'Nothing on this page.' : 'No movements match these filters yet.'}
        </p>
      ) : (
        <div className={cn('overflow-x-auto border-t', isFetching && 'opacity-60')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => {
                const t = String(m.movement_type).toUpperCase();
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDateTime(m.created_at)}</TableCell>
                    <TableCell className="text-sm">{branchName.get(m.branch_id) ?? '-'}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          TYPE_STYLE[t] ?? 'bg-zinc-100 text-zinc-700'
                        )}
                      >
                        {TYPE_LABEL[t] ?? t}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        m.quantity_change > 0 ? 'text-emerald-700' : 'text-red-700'
                      )}
                    >
                      {m.quantity_change > 0 ? '+' : ''}
                      {m.quantity_change}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground">
                      {m.quantity_before} &rarr; <span className="font-medium text-foreground">{m.quantity_after}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {m.unit_cost != null ? formatMoney(Number(m.unit_cost)) : '-'}
                    </TableCell>
                    <TableCell className="max-w-56">
                      <p className="text-sm">{reasonLabel(m.reason)}</p>
                      {m.note && <p className="truncate text-xs text-muted-foreground">{m.note}</p>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.created_by ? (staff.get(m.created_by) ?? 'Staff member') : 'System'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
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
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
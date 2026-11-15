import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from '@/components/PageHeader';
import ProductImage from '@/components/ProductImage';
import StockStatusBadge from '@/features/products/StockStatusBadge';
import { useGetPosStockQuery } from '@/features/sales/posApi';
import { useBranchScope } from '@/hooks/use-branch-scope';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

export default function SellerProductsPage() {
  const { lockedBranchId, missingBranch } = useBranchScope();
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(0);

  const term = useDebouncedValue(search, 300).trim();
  // back to page 1 when the term that is actually SENT changes
  const [lastTerm, setLastTerm] = useState(term);
  if (lastTerm !== term) {
    setLastTerm(term);
    setPage(0);
  }

  const { data, isLoading, isFetching, isError, refetch } = useGetPosStockQuery(
    {
      branch_id: lockedBranchId ?? '',
      search: term || undefined,
      low_stock: lowOnly || undefined,
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    },
    { skip: !lockedBranchId, refetchOnMountOrArgChange: true }
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  if (missingBranch) {
    return (
      <div className="space-y-4">
        <PageHeader title="Products" />
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your account is not assigned to a branch yet. Ask a super admin to assign you to a branch.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        description={term ? `${total} ${total === 1 ? 'match' : 'matches'} for "${term}"` : `${total} products in your branch`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            aria-label="Search products"
            placeholder="Search by name, SKU or barcode"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <button
          type="button"
          aria-pressed={lowOnly}
          onClick={() => {
            setLowOnly((v) => !v);
            setPage(0);
          }}
          className={cn(
            'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
            lowOnly ? 'border-orange-600 bg-orange-600 text-white' : 'bg-white text-zinc-600 hover:bg-orange-50'
          )}
        >
          Low stock only
        </button>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          {isError ? (
            <div className="p-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground">Could not load the products.</p>
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
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                {page > 0
                  ? 'There are no products on this page.'
                  : term
                    ? `No product matches "${term}".`
                    : lowOnly
                      ? 'Nothing is low on stock.'
                      : 'Your branch has no products yet.'}
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
                    <TableHead>SKU</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="max-w-64">
                        <div className="flex items-center gap-3">
                          <ProductImage src={i.product.image_url} alt={i.product.name} className="h-10 w-10" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{i.product.name}</p>
                            <p className="text-xs text-muted-foreground">{i.product.unit}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{i.product.sku}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{i.product.barcode ?? '-'}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(i.product.selling_price)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-medium tabular-nums">{i.quantity}</span>
                          <StockStatusBadge stock={i.quantity} reorder={i.reorder_level ?? i.product.reorder_level} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
    </div>
  );
}
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, Coins, Percent, Tag, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ProductImage from '@/components/ProductImage';
import StatCard from '@/components/StatCard';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import { formatCount, formatDateTime, formatMoney, formatMoneyCompact, timeAgo } from '@/lib/format';
import MovementHistory from './MovementHistory';
import { useGetProductByIdQuery, useGetProductInventoryQuery } from './productDetailApi';
import StockStatusBadge from './StockStatusBadge';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  );
}

export default function ProductDetail({ basePath }: { basePath: string }) {
  const { productId = '' } = useParams();

  const {
    data: product,
    error,
    isLoading,
    refetch,
  } = useGetProductByIdQuery(productId, { skip: !productId, refetchOnMountOrArgChange: true });
  const { data: inventory, isLoading: loadingStock } = useGetProductInventoryQuery(productId, {
    skip: !productId,
    refetchOnMountOrArgChange: true,
  });
  const { data: branches = [] } = useGetBranchesQuery();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!product) {
    const notFound = (error as { status?: number } | undefined)?.status === 404;
    return (
      <div className="rounded-md border bg-white p-8 text-center">
        <p className="mb-3 text-sm text-muted-foreground">
          {notFound ? 'This product was not found.' : 'Could not load this product.'}
        </p>
        <div className="flex justify-center gap-2">
          {!notFound && (
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to={basePath}>Back to products</Link>
          </Button>
        </div>
      </div>
    );
  }

  const rows = inventory?.items ?? [];
  const totalStock = rows.reduce((sum, r) => sum + r.quantity, 0);
  const cost = Number(product.cost_price);
  const price = Number(product.selling_price);
  const margin = price > 0 ? ((price - cost) / price) * 100 : null;
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <Link
        to={basePath}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-orange-600"
      >
        <ArrowLeft className="h-4 w-4" /> All products
      </Link>

      {/* Header */}
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <ProductImage src={product.image_url} alt={product.name} className="h-20 w-20" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{product.name}</h1>
              <span
                className={
                  product.is_active
                    ? 'rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700'
                    : 'rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600'
                }
              >
                {product.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{product.sku}</p>
            {product.description && <p className="mt-2 text-sm text-zinc-600">{product.description}</p>}
          </div>
        </div>
      </Card>

      {/* Key numbers */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          title="Total stock"
          value={`${formatCount(totalStock)} ${product.unit}`}
          icon={Boxes}
          tone="violet"
          loading={loadingStock}
        />
        <StatCard
          title="Stock value"
          value={formatMoney(totalStock * cost)}
          compactValue={formatMoneyCompact(totalStock * cost)}
          icon={Warehouse}
          tone="sky"
          loading={loadingStock}
        />
        <StatCard
          title="Selling price"
          value={formatMoney(price)}
          compactValue={formatMoneyCompact(price)}
          icon={Tag}
          tone="orange"
        />
        <StatCard
          title="Average cost"
          value={formatMoney(cost)}
          compactValue={formatMoneyCompact(cost)}
          icon={Coins}
          tone="rose"
        />
        <StatCard
          title="Margin"
          value={margin === null ? '-' : `${margin.toFixed(1)}%`}
          icon={Percent}
          tone="emerald"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Details */}
        <Card className="gap-0 py-0">
          <div className="p-4 pb-0">
            <h2 className="text-base font-semibold">Details</h2>
          </div>
          <dl className="divide-y px-4 pb-2">
            <Row label="SKU">
              <span className="font-mono">{product.sku}</span>
            </Row>
            <Row label="Barcode">{product.barcode || '-'}</Row>
            <Row label="Unit">{product.unit}</Row>
            <Row label="Reorder level">{product.reorder_level}</Row>
            <Row label="Lead time">{product.lead_time_days} days</Row>
            <Row label="Added">{formatDateTime(product.created_at)}</Row>
            <Row label="Last updated">{timeAgo(product.updated_at)}</Row>
          </dl>
        </Card>

        {/* Stock by branch */}
        <Card className="gap-0 py-0 lg:col-span-2">
          <div className="p-4">
            <h2 className="text-base font-semibold">Stock by branch</h2>
            <p className="text-sm text-muted-foreground">
              A branch appears here after its first delivery or count.
            </p>
          </div>

          {loadingStock ? (
            <div className="space-y-2 border-t p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="border-t p-8 text-center text-sm text-muted-foreground">
              No branch holds this product yet. Receive stock from the products list.
            </p>
          ) : (
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Reorder at</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last counted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const reorder = r.reorder_level ?? product.reorder_level;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{branchName.get(r.branch_id) ?? 'Unknown branch'}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{r.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">{reorder}</TableCell>
                        <TableCell>
                          <StockStatusBadge stock={r.quantity} reorder={reorder} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{timeAgo(r.last_counted_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <MovementHistory productId={product.id} branches={branches} />
    </div>
  );
}
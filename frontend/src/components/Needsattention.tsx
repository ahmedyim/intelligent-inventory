import { Link } from 'react-router-dom';
import { Package, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface AttentionItem {
    id: string | number;
    sku: string;
    name: string;
    category: string;
    stock: number;
    reorderPoint: number;
}

interface Props {
    items: AttentionItem[];
    loading?: boolean;
    viewAllTo?: string;
    onReorder?: (item: AttentionItem) => void;
}

export default function NeedsAttention({ items, loading, viewAllTo = '/super-admin/products', onReorder }: Props) {
    return (
        <Card className="gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-sm ring-1 ring-zinc-200/70">
            <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2">
                    <TriangleAlert className="h-5 w-5 text-amber-500" />
                    <h2 className="text-base font-semibold text-zinc-900">Needs Attention</h2>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                    </span>
                </div>
                <Link to={viewAllTo} className="text-sm font-medium text-orange-600 hover:underline">
                    View All
                </Link>
            </div>

            {loading ? (
                <div className="px-5 pb-5">
                    <Skeleton className="h-32 w-full" />
                </div>
            ) : items.length === 0 ? (
                <p className="border-t px-5 py-8 text-center text-sm text-muted-foreground">
                    Every product is above its reorder point.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="border-y bg-zinc-50/80 text-left text-muted-foreground">
                                <th className="px-5 py-3 font-medium">SKU</th>
                                <th className="px-3 py-3 font-medium">Product Name</th>
                                <th className="px-3 py-3 font-medium">Category</th>
                                <th className="px-3 py-3 text-right font-medium">Current Stock</th>
                                <th className="px-3 py-3 text-right font-medium">Reorder Point</th>
                                <th className="px-3 py-3 text-center font-medium">Status</th>
                                <th className="px-5 py-3 text-right font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map((it) => {
                                const out = it.stock <= 0;
                                return (
                                    <tr key={it.id} className={cn('transition-colors hover:bg-orange-50/40', out && 'bg-red-50/50')}>
                                        <td className="px-5 py-3.5 font-medium text-zinc-900">{it.sku}</td>
                                        <td className="px-3 py-3.5">
                                            <span className="flex items-center gap-3">
                                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500">
                                                    <Package className="h-4 w-4" />
                                                </span>
                                                <span className="max-w-[16rem] truncate text-zinc-900">{it.name}</span>
                                            </span>
                                        </td>
                                        <td className="px-3 py-3.5 text-muted-foreground">{it.category}</td>
                                        <td className={cn('px-3 py-3.5 text-right font-medium', out ? 'text-red-600' : 'text-amber-600')}>
                                            {it.stock}
                                        </td>
                                        <td className="px-3 py-3.5 text-right text-muted-foreground">{it.reorderPoint}</td>
                                        <td className="px-3 py-3.5 text-center">
                                            <span
                                                className={cn(
                                                    'inline-block rounded-full px-2.5 py-1 text-xs font-medium',
                                                    out ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'
                                                )}
                                            >
                                                {out ? 'Out of Stock' : 'Low Stock'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <Button
                                                size="sm"
                                                className="rounded-lg bg-orange-600 hover:bg-orange-700"
                                                onClick={() => onReorder?.(it)}
                                            >
                                                Reorder
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import ProductImage from '@/components/ProductImage';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useGetPublicCategoriesQuery, useGetPublicProductsQuery } from './publicApi';

const STEP = 8;
const MAX = 48;
const CHIPS = 8;

export default function PublicCatalog() {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [limit, setLimit] = useState(STEP);

    const term = useDebouncedValue(search, 300).trim();
    const { data: categories = [] } = useGetPublicCategoriesQuery();
    const { data, isLoading, isFetching, isError, refetch } = useGetPublicProductsQuery({
        search: term || undefined,
        category: category || undefined,
        limit,
    });

    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const hasMore = items.length < total && limit < MAX;

    const pickCategory = (name: string) => {
        setCategory(name);
        setLimit(STEP);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                        type="search"
                        aria-label="Search products"
                        placeholder="Search products"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setLimit(STEP);
                        }}
                        className="pl-9"
                    />
                </div>

                {categories.length > 0 && (
                    <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
                        {[{ name: '', products: 0 }, ...categories.slice(0, CHIPS)].map((c) => {
                            const active = category === c.name;
                            return (
                                <button
                                    key={c.name || 'all'}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => pickCategory(c.name)}
                                    className={cn(
                                        'rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                                        active ? 'border-orange-600 bg-orange-600 text-white' : 'bg-white text-zinc-600 hover:bg-orange-50'
                                    )}
                                >
                                    {c.name || 'All'}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {isError ? (
                <div className="rounded-xl border bg-white p-8 text-center">
                    <p className="mb-3 text-sm text-muted-foreground">The catalog could not be loaded right now.</p>
                    <Button variant="outline" onClick={() => refetch()}>
                        Try again
                    </Button>
                </div>
            ) : isLoading ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-64 w-full" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <p className="rounded-xl border bg-white p-10 text-center text-sm text-muted-foreground">
                    {term || category ? 'No product matches your search.' : 'Our catalog will appear here soon.'}
                </p>
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        {total} {total === 1 ? 'product' : 'products'}
                    </p>
                    <div className={cn('grid grid-cols-2 gap-4 md:grid-cols-4', isFetching && 'opacity-60')}>
                        {items.map((p) => (
                            <article key={p.id} className="flex flex-col gap-3 rounded-xl border bg-white p-3 transition-shadow hover:shadow-md">
                                <ProductImage src={p.image_url} alt={p.name} className="aspect-square w-full" />
                                <div className="min-w-0 flex-1">
                                    {p.category && <p className="truncate text-xs text-orange-600">{p.category}</p>}
                                    <h3 className="line-clamp-2 text-sm font-medium">{p.name}</h3>
                                </div>
                                <div className="flex items-end justify-between gap-2">
                                    <span className="font-semibold tabular-nums">{formatMoney(p.price)}</span>
                                    <span
                                        className={cn(
                                            'rounded-full px-2 py-0.5 text-xs font-medium',
                                            p.in_stock ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                                        )}
                                    >
                                        {p.in_stock ? 'In stock' : 'Out of stock'}
                                    </span>
                                </div>
                                {p.in_stock && p.branches_available > 0 && (
                                    <p className="-mt-1 text-xs text-muted-foreground">
                                        Available in {p.branches_available} {p.branches_available === 1 ? 'branch' : 'branches'}
                                    </p>
                                )}
                            </article>
                        ))}
                    </div>

                    {hasMore && (
                        <div className="text-center">
                            <Button variant="outline" onClick={() => setLimit((l) => Math.min(MAX, l + STEP))}>
                                Show more
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
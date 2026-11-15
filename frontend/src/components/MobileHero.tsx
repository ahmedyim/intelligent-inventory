import { TrendingDown, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  value: string;
  change?: number | null;
  compare: string; // "yesterday", "last week", ...
  salesCount: string;
  footer: string;
  loading?: boolean;
}

export default function MobileHero({ value, change, compare, salesCount, footer, loading }: Props) {
  const hasChange = typeof change === 'number';

  return (
    <section className="rounded-2xl bg-gradient-to-br from-orange-600 to-orange-700 p-4 text-white shadow-sm md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-orange-50">Total revenue</p>
          {loading ? (
            <Skeleton className="mt-2 h-9 w-40 bg-white/30" />
          ) : (
            <p className="mt-1 truncate text-3xl font-bold tracking-tight">{value}</p>
          )}
          {!loading && hasChange && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-xs font-medium">
              {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {change > 0 ? '+' : ''}
              {change.toFixed(1)}% vs {compare}
            </p>
          )}
        </div>

        <div className="shrink-0 rounded-xl bg-white/15 px-3 py-2 text-right ring-1 ring-white/25">
          <p className="text-xl font-bold">{loading ? '-' : salesCount}</p>
          <p className="text-xs text-orange-50">sales</p>
        </div>
      </div>

      <p className="mt-4 border-t border-white/20 pt-3 text-xs text-orange-50">{footer}</p>
    </section>
  );
}
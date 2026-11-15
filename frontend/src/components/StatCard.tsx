import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const TONES = {
  orange: 'bg-orange-100 text-orange-600',
  sky: 'bg-sky-100 text-sky-600',
  rose: 'bg-rose-100 text-rose-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  violet: 'bg-violet-100 text-violet-600',
} as const;

interface Props {
  title: string;
  value: string;
  compactValue?: string; // shorter text for phones, e.g. "ETB 1.3M"
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  change?: number | null; // percent versus the previous period
  upIsGood?: boolean; // false for cost: a rise is bad news
  hint?: string;
  loading?: boolean;
  className?: string;
}

export default function StatCard({
  title,
  value,
  compactValue,
  icon: Icon,
  tone = 'orange',
  change,
  upIsGood = true,
  hint,
  loading,
  className,
}: Props) {
  const hasChange = typeof change === 'number';
  const good = hasChange && (upIsGood ? change >= 0 : change <= 0);

  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', TONES[tone])}>
          <Icon className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{title}</p>

            {!loading && hasChange && (
              <span
                className={cn(
                  'hidden shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium sm:inline-flex',
                  good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                )}
              >
                {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {change > 0 ? '+' : ''}
                {change.toFixed(1)}%
              </span>
            )}
          </div>

          {loading ? (
            <Skeleton className="mt-1 h-6 w-24" />
          ) : (
            <p className="flex items-baseline gap-2">
              <span className="truncate text-lg font-bold leading-tight tracking-tight sm:text-xl">
                {compactValue ? (
                  <>
                    <span className="sm:hidden">{compactValue}</span>
                    <span className="hidden sm:inline">{value}</span>
                  </>
                ) : (
                  value
                )}
              </span>
              {hint && <span className="hidden shrink-0 text-xs text-zinc-500 2xl:inline">{hint}</span>}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
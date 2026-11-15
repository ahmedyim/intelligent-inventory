import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetTrendQuery } from '@/features/reports/reportsApi';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TrendGranularity } from '@/types';

const OPTIONS: { value: TrendGranularity; label: string; subtitle: string }[] = [
  { value: 'day', label: 'Daily', subtitle: 'Last 14 days' },
  { value: 'week', label: 'Weekly', subtitle: 'Last 12 weeks' },
  { value: 'month', label: 'Monthly', subtitle: 'Last 12 months' },
];

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function labels(date: string, g: TrendGranularity) {
  const d = new Date(`${date}T00:00:00`); // local midnight, no timezone shift
  return g === 'month'
    ? {
      short: d.toLocaleDateString('en-US', { month: 'short' }),
      full: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
    : {
      short: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      full: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    };
}

interface SalesChartProps {
  /** Limit the chart to one branch. Leave out to show all branches (super admin). */
  branchId?: string;
}

export default function SalesChart({ branchId }: SalesChartProps) {
  const [granularity, setGranularity] = useState<TrendGranularity>('day');
  const { data, isFetching, isError, refetch } = useGetTrendQuery({ granularity, branch_id: branchId });

  const points = useMemo(
    () =>
      (data?.points ?? []).map((p) => {
        const l = labels(p.date, granularity);
        return { ...p, label: l.short, full: l.full };
      }),
    [data, granularity]
  );
  const hasData = points.some((p) => p.revenue > 0);
  const subtitle = OPTIONS.find((o) => o.value === granularity)?.subtitle ?? '';

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-2">
        <div>
          <h2 className="text-base font-semibold">Sales statistics</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div role="group" aria-label="Chart range" className="inline-flex rounded-lg bg-zinc-100 p-1">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={granularity === o.value}
              onClick={() => setGranularity(o.value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                granularity === o.value ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:text-zinc-900'
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 px-4 text-xs text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-orange-600" /> Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-600" /> Profit
        </span>
      </div>

      <div className="px-2 pb-4 pt-2">
        {isError ? (
          <div className="grid h-64 place-items-center text-center">
            <div>
              <p className="mb-3 text-sm text-muted-foreground">Could not load the chart.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : isFetching && !data ? (
          <Skeleton className="mx-2 h-64" />
        ) : !hasData ? (
          <div className="grid h-64 place-items-center text-sm text-muted-foreground">
            No sales in this range yet.
          </div>
        ) : (
          <div className="h-64 w-full" role="img" aria-label="Revenue and profit over time">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb923c" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: '#71717a' }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 12, fill: '#71717a' }}
                  tickFormatter={(v: number) => compact.format(v)}
                />
                <Tooltip
                  formatter={(value, name) => [formatMoney(Number(value)), name]}
                  labelFormatter={(_label, payload) =>
                    (payload?.[0]?.payload as { full?: string } | undefined)?.full ?? ''
                  }
                  contentStyle={{ borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 13 }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#ea580c"
                  strokeWidth={2}
                  fill="url(#revenue-fill)"
                />
                <Area type="monotone" dataKey="profit" name="Profit" stroke="#059669" strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}
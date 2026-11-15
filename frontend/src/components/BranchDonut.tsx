import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetRevenueByBranchQuery } from '@/features/reports/reportsApi';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import type { ReportPeriod } from '@/types';

const COLORS = ['#ea580c', '#fb923c', '#fdba74', '#f59e0b', '#a8a29e', '#d4d4d8'];
const MAX_SLICES = 5;

interface Props {
  period: ReportPeriod;
  periodLabel: string;
}

export default function BranchDonut({ period, periodLabel }: Props) {
  const { data, isFetching, isError, refetch } = useGetRevenueByBranchQuery({ period });

  const { slices, total } = useMemo(() => {
    const rows = [...(data ?? [])].filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    const top = rows.slice(0, MAX_SLICES).map((r) => ({ name: r.branch_name, value: r.revenue }));
    const rest = rows.slice(MAX_SLICES).reduce((sum, r) => sum + r.revenue, 0);
    if (rest > 0) top.push({ name: 'Others', value: rest });
    return { slices: top, total: top.reduce((sum, s) => sum + s.value, 0) };
  }, [data]);

  return (
    <Card className="gap-0 py-0">
      <div className="p-4 pb-2">
        <h2 className="text-base font-semibold">Revenue by branch</h2>
        <p className="text-sm text-muted-foreground">{periodLabel}</p>
      </div>

      <div className="px-4 pb-4">
        {isError ? (
          <div className="grid h-56 place-items-center text-center">
            <div>
              <p className="mb-3 text-sm text-muted-foreground">Could not load this chart.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : isFetching && !data ? (
          <Skeleton className="h-56" />
        ) : slices.length === 0 ? (
          <div className="grid h-56 place-items-center text-sm text-muted-foreground">No sales in this period.</div>
        ) : (
          <>
            <div className="relative h-44" role="img" aria-label="Revenue share by branch">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="90%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {slices.map((s, i) => (
                      <Cell key={s.name} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [formatMoney(Number(value)), name]}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 13 }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="text-lg font-bold leading-tight">{formatMoneyCompact(total)}</p>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                </div>
              </div>
            </div>

            <ul className="mt-3 space-y-2 text-sm">
              {slices.map((s, i) => (
                <li key={s.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="font-medium">{Math.round((s.value / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}
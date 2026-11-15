import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Suggestion } from '@/types';
import { useGetProductForecastQuery } from './forecastApi';

const HORIZONS = [7, 14, 30, 60];
const round1 = (n: number) => Math.round(n * 10) / 10;
const pretty = (s: string) => s.replace(/_/g, ' ');

interface Point {
    day: number;
    demand: number;
    cumulative: number;
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-lg bg-zinc-50 p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

interface Props {
    suggestion: Suggestion | null;
    onClose: () => void;
}

export default function ForecastChartDialog({ suggestion, onClose }: Props) {
    const [horizon, setHorizon] = useState(14);

    const { data, isFetching, isError, refetch } = useGetProductForecastQuery(
        { product_id: suggestion?.product_id ?? '', branch_id: suggestion?.branch_id ?? '', horizon },
        { skip: !suggestion || !suggestion.product_id, refetchOnMountOrArgChange: true }
    );

    const stock = suggestion?.current_stock ?? 0;

    const points = useMemo<Point[]>(() => {
        let sum = 0;
        return (data?.daily ?? []).map((v, i) => {
            sum += v;
            return { day: i + 1, demand: round1(v), cumulative: round1(sum) };
        });
    }, [data]);

    const stockOutDay = points.find((p) => p.cumulative >= stock)?.day ?? null;
    const cover = data && data.avg_daily > 0 ? stock / data.avg_daily : null;
    const unit = suggestion?.product?.unit ?? 'units';

    return (
        <Dialog open={suggestion !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{suggestion?.product?.name ?? 'Demand forecast'}</DialogTitle>
                    <DialogDescription>
                        Expected sales for this product in this branch. Day 1 is the first day after the calculation.
                    </DialogDescription>
                </DialogHeader>

                <div role="group" aria-label="Forecast length" className="inline-flex w-fit rounded-lg border bg-white p-1">
                    {HORIZONS.map((h) => (
                        <button
                            key={h}
                            type="button"
                            aria-pressed={horizon === h}
                            onClick={() => setHorizon(h)}
                            className={cn(
                                'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                                horizon === h ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-orange-50'
                            )}
                        >
                            {h} days
                        </button>
                    ))}
                </div>

                {isError ? (
                    <div className="rounded-lg border p-6 text-center">
                        <p className="mb-3 text-sm text-muted-foreground">Could not load the forecast.</p>
                        <Button variant="outline" size="sm" onClick={() => refetch()}>
                            Try again
                        </Button>
                    </div>
                ) : !data ? (
                    <div className="space-y-3">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                ) : (
                    <div className={cn('space-y-4', isFetching && 'opacity-60')}>
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Fact label="Average per day" value={`${round1(data.avg_daily)}`} hint={`+/- ${round1(data.std_daily)} typical swing`} />
                            <Fact label={`Expected in ${horizon} days`} value={`${round1(data.total_units)}`} hint={unit} />
                            <Fact label="Stock when calculated" value={`${stock}`} hint={unit} />
                            <Fact
                                label="Days of cover"
                                value={cover === null ? '-' : `${round1(cover)}`}
                                hint={cover === null ? 'no recent sales' : 'at the average pace'}
                            />
                        </dl>

                        {stockOutDay !== null ? (
                            <p role="status" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                                At the expected pace, this product runs out around <strong>day {stockOutDay}</strong>.
                            </p>
                        ) : (
                            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                                The current stock covers the next {horizon} days.
                            </p>
                        )}

                        {data.history_days < 14 && (
                            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                Based on only {data.history_days} {data.history_days === 1 ? 'day' : 'days'} of sales history, so treat
                                this as a rough estimate.
                            </p>
                        )}

                        <div className="h-64 w-full" role="img" aria-label="Expected total demand compared with current stock">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={points} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="demand-fill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#fb923c" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#71717a' }} minTickGap={16} />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        width={40}
                                        tick={{ fontSize: 12, fill: '#71717a' }}
                                        domain={[0, (max: number) => Math.ceil(Math.max(max, stock) * 1.1)]}
                                    />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                                            if (!p) return null;
                                            return (
                                                <div className="rounded-lg border bg-white p-2 text-xs shadow-sm">
                                                    <p className="font-medium">Day {p.day}</p>
                                                    <p>Expected that day: {p.demand} {unit}</p>
                                                    <p>Expected so far: {p.cumulative} {unit}</p>
                                                </div>
                                            );
                                        }}
                                    />
                                    <ReferenceLine
                                        y={stock}
                                        stroke="#dc2626"
                                        strokeDasharray="5 4"
                                        label={{ value: `Stock ${stock}`, position: 'insideTopRight', fill: '#dc2626', fontSize: 12 }}
                                    />
                                    <Area type="monotone" dataKey="cumulative" stroke="#ea580c" strokeWidth={2} fill="url(#demand-fill)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            Method: {pretty(data.method)}. The orange line is the total demand expected so far. Where it crosses the
                            red line, the stock is used up.
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
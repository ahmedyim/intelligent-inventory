import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface InventoryPoint {
    label: string; // "Jan", "Feb", ...
    inStock: number;
    lowStock: number;
    outOfStock: number;
}

interface Props {
    data: InventoryPoint[];
    loading?: boolean;
}

export default function InventoryTrends({ data, loading }: Props) {
    return (
        <Card className="gap-0 rounded-2xl border-0 p-5 shadow-sm ring-1 ring-zinc-200/70">
            <div className="mb-4">
                <h2 className="text-base font-semibold text-zinc-900">Inventory Trends</h2>
                <p className="text-sm text-muted-foreground">Stock levels over time</p>
            </div>

            {loading ? (
                <Skeleton className="h-64 w-full" />
            ) : data.length === 0 ? (
                <p className="grid h-64 place-items-center text-sm text-muted-foreground">No stock history yet.</p>
            ) : (
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                            <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 12, fill: '#71717a' }} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7', fontSize: 13 }} />
                            <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                            <Line type="monotone" dataKey="inStock" name="In Stock" stroke="#10b981" strokeWidth={2.5} dot={false} />
                            <Line type="monotone" dataKey="lowStock" name="Low Stock" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                            <Line type="monotone" dataKey="outOfStock" name="Out of Stock" stroke="#ef4444" strokeWidth={2.5} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}
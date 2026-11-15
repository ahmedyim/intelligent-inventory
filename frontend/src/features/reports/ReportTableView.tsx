import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCount, formatDateTime, formatMoney } from '@/lib/format';
import { formatDay } from '@/lib/sales';
import { cn } from '@/lib/utils';
import type { ReportColumn, ReportTable, ReportValue } from '@/types';

const isNumeric = (c: ReportColumn) => c.type === 'money' || c.type === 'int' || c.type === 'percent';

function render(col: ReportColumn, v: ReportValue | undefined): ReactNode {
    if (v === null || v === undefined || v === '') return '-';
    switch (col.type) {
        case 'money':
            return formatMoney(Number(v));
        case 'int':
            return formatCount(Number(v));
        case 'percent':
            return `${(Number(v) * 100).toFixed(1)}%`;
        case 'date':
            return formatDay(String(v));
        case 'datetime':
            return formatDateTime(String(v));
        default:
            return String(v);
    }
}

const STATUS_TONE: Record<string, string> = {
    'Out of stock': 'font-medium text-red-700',
    Low: 'font-medium text-amber-700',
    Voided: 'text-muted-foreground',
};

function tone(col: ReportColumn, v: ReportValue | undefined): string | undefined {
    if (col.key === 'status' && typeof v === 'string') return STATUS_TONE[v];
    if (col.key === 'days_overdue' && Number(v) > 0) return 'font-medium text-red-700';
    if (col.key === 'profit' && Number(v) < 0) return 'text-red-700';
    return undefined;
}

export default function ReportTableView({ table, dimmed }: { table: ReportTable; dimmed?: boolean }) {
    const { columns, rows, totals } = table;

    return (
        <div className={cn('overflow-x-auto', dimmed && 'opacity-60')}>
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map((c) => (
                            <TableHead key={c.key} className={cn(isNumeric(c) && 'text-right', 'whitespace-nowrap')}>
                                {c.label}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {rows.map((row, i) => (
                        <TableRow key={`${table.skip}-${i}`}>
                            {columns.map((c) => (
                                <TableCell
                                    key={c.key}
                                    className={cn(
                                        'text-sm',
                                        isNumeric(c) && 'text-right tabular-nums',
                                        (c.type === 'datetime' || c.type === 'date') && 'whitespace-nowrap',
                                        c.key === 'sale_number' && 'font-mono',
                                        tone(c, row[c.key])
                                    )}
                                >
                                    {render(c, row[c.key])}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>

                {totals && rows.length > 0 && (
                    <TableFooter>
                        <TableRow className="bg-zinc-50 font-semibold">
                            {columns.map((c, i) => {
                                const v = totals[c.key];
                                return (
                                    <TableCell key={c.key} className={cn('text-sm', isNumeric(c) && 'text-right tabular-nums')}>
                                        {v !== null && v !== undefined ? render(c, v) : i === 0 ? 'Total' : ''}
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableFooter>
                )}
            </Table>
        </div>
    );
}
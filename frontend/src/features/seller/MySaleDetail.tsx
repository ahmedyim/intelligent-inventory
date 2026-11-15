import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Hourglass, Package, Undo2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ProductImage from '@/components/ProductImage';
import StatCard from '@/components/StatCard';
import { PaymentStatusBadge } from '@/features/sales/SaleBadges';
import { formatDateTime, formatMoney } from '@/lib/format';
import { formatDay, isOverdue, methodLabel } from '@/lib/sales';
import { cn } from '@/lib/utils';
import RefundSaleDialog from './RefundSaleDialog';
import SaleStatePill from './SaleStatePill';
import { useGetSaleReceiptQuery } from './sellerApi';

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
        </div>
    );
}

export default function MySaleDetail() {
    const { saleId = '' } = useParams();
    const location = useLocation();
    const basePath = location.pathname.replace(/\/[^/]+\/?$/, ''); // "/seller/sales"
    const backSearch = (location.state as { from?: string } | null)?.from ?? '';

    const [refundOpen, setRefundOpen] = useState(false);
    const { data: sale, error, isLoading, refetch } = useGetSaleReceiptQuery(saleId, {
        skip: !saleId,
        refetchOnMountOrArgChange: true,
    });

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!sale) {
        const notFound = (error as { status?: number } | undefined)?.status === 404;
        return (
            <div className="rounded-md border bg-white p-8 text-center">
                <p className="mb-3 text-sm text-muted-foreground">
                    {notFound ? 'This sale was not found.' : 'Could not load this sale.'}
                </p>
                <div className="flex justify-center gap-2">
                    {!notFound && (
                        <Button variant="outline" onClick={() => refetch()}>
                            Try again
                        </Button>
                    )}
                    <Button asChild variant="outline">
                        <Link to={{ pathname: basePath, search: backSearch }}>Back to my sales</Link>
                    </Button>
                </div>
            </div>
        );
    }

    const refunded = String(sale.status).toUpperCase() === 'VOIDED';
    const overdue = isOverdue(sale.status, sale.balance_due, sale.due_date);
    const units = sale.items.reduce((sum, i) => sum + i.quantity, 0);
    const refundedAmount = sale.payments.filter((p) => p.amount < 0).reduce((sum, p) => sum + -p.amount, 0);

    return (
        <div className="space-y-6">
            <Link
                to={{ pathname: basePath, search: backSearch }}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-orange-600"
            >
                <ArrowLeft className="h-4 w-4" /> My sales
            </Link>

            <Card className="gap-0 py-0">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="font-mono text-xl font-semibold">{sale.sale_number}</h1>
                            <SaleStatePill status={sale.status} />
                            {!refunded && <PaymentStatusBadge status={sale.payment_status} />}
                            {overdue && (
                                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Overdue</span>
                            )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {formatDateTime(sale.created_at)}
                            {sale.staff_name && ` - sold by ${sale.staff_name}`}
                            {sale.branch_name && ` - ${sale.branch_name}`}
                        </p>
                    </div>

                    {sale.can_refund && (
                        <Button
                            variant="outline"
                            onClick={() => setRefundOpen(true)}
                            className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
                        >
                            <Undo2 className="mr-2 h-4 w-4" /> Refund sale
                        </Button>
                    )}
                </div>

                {refunded ? (
                    <p className="border-t bg-zinc-50 px-5 py-3 text-sm text-zinc-700">
                        Refunded {formatDateTime(sale.voided_at)}
                        {sale.voided_by_name && ` by ${sale.voided_by_name}`}. The items were returned to stock
                        {refundedAmount > 0 ? ` and ${formatMoney(refundedAmount)} was given back.` : '.'}
                    </p>
                ) : sale.can_refund && sale.refund_deadline ? (
                    <p className="border-t bg-zinc-50 px-5 py-3 text-sm text-muted-foreground">
                        You can refund this sale until {formatDateTime(sale.refund_deadline)}.
                    </p>
                ) : (
                    sale.refund_blocked_reason && (
                        <p className="border-t bg-amber-50 px-5 py-3 text-sm text-amber-800">{sale.refund_blocked_reason}</p>
                    )
                )}
            </Card>

            <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatCard title="Total" value={formatMoney(sale.total)} icon={Banknote} tone="sky" />
                <StatCard title="Paid" value={formatMoney(sale.amount_paid)} icon={Wallet} tone="emerald" />
                <StatCard
                    title="On credit"
                    value={formatMoney(sale.balance_due)}
                    icon={Hourglass}
                    tone={overdue ? 'rose' : 'amber'}
                    hint={sale.balance_due > 0 && sale.due_date ? `Due ${formatDay(sale.due_date)}` : undefined}
                />
                <StatCard title="Items" value={`${units}`} icon={Package} tone="violet" />
            </section>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                    <Card className="gap-0 py-0">
                        <div className="p-4">
                            <h2 className="text-base font-semibold">Items</h2>
                        </div>
                        <div className="overflow-x-auto border-t">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Price</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sale.items.map((i) => (
                                        <TableRow key={i.id}>
                                            <TableCell className="max-w-64">
                                                <div className="flex items-center gap-3">
                                                    <ProductImage src={i.image_url} alt={i.product_name ?? 'Product'} className="h-10 w-10" />
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">{i.product_name ?? 'Removed product'}</p>
                                                        <p className="font-mono text-xs text-muted-foreground">{i.sku ?? '-'}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{i.quantity}</TableCell>
                                            <TableCell className="text-right tabular-nums">{formatMoney(i.unit_price)}</TableCell>
                                            <TableCell className="text-right font-medium tabular-nums">{formatMoney(i.line_total)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>

                    <Card className="gap-0 py-0">
                        <div className="p-4">
                            <h2 className="text-base font-semibold">Payments</h2>
                            <p className="text-sm text-muted-foreground">Refunds appear as negative amounts.</p>
                        </div>
                        {sale.payments.length === 0 ? (
                            <p className="border-t p-6 text-center text-sm text-muted-foreground">
                                No payment yet. The full amount is on credit.
                            </p>
                        ) : (
                            <div className="overflow-x-auto border-t">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>When</TableHead>
                                            <TableHead>Method</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead>Reference</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sale.payments.map((p) => (
                                            <TableRow key={p.id}>
                                                <TableCell className="whitespace-nowrap text-sm">{formatDateTime(p.created_at)}</TableCell>
                                                <TableCell className="text-sm">{methodLabel(p.method)}</TableCell>
                                                <TableCell
                                                    className={cn('text-right font-medium tabular-nums', p.amount < 0 ? 'text-red-700' : 'text-emerald-700')}
                                                >
                                                    {formatMoney(p.amount)}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{p.reference ?? '-'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card className="gap-0 py-0">
                        <div className="p-4 pb-0">
                            <h2 className="text-base font-semibold">Sale details</h2>
                        </div>
                        <dl className="divide-y px-4 pb-2">
                            <Row label="Customer">{sale.customer_name ?? 'Walk-in'}</Row>
                            {sale.customer_phone && <Row label="Customer phone">{sale.customer_phone}</Row>}
                            <Row label="Payment">{methodLabel(sale.payment_method)}</Row>
                            <Row label="Created">{formatDateTime(sale.created_at)}</Row>
                            {sale.due_date && <Row label="Due date">{formatDay(sale.due_date)}</Row>}
                            {sale.note && <Row label="Note">{sale.note}</Row>}
                        </dl>
                    </Card>

                    <Card className="gap-0 py-0">
                        <div className="p-4 pb-0">
                            <h2 className="text-base font-semibold">Totals</h2>
                        </div>
                        <dl className="divide-y px-4 pb-2">
                            <Row label="Subtotal">{formatMoney(sale.subtotal)}</Row>
                            <Row label="Discount">{sale.discount > 0 ? `- ${formatMoney(sale.discount)}` : '-'}</Row>
                            <Row label="Total">{formatMoney(sale.total)}</Row>
                            <Row label="Paid">{formatMoney(sale.amount_paid)}</Row>
                            <Row label="On credit">
                                <span className={overdue ? 'text-red-700' : sale.balance_due > 0 ? 'text-amber-700' : undefined}>
                                    {formatMoney(sale.balance_due)}
                                </span>
                            </Row>
                        </dl>
                    </Card>
                </div>
            </div>

            <RefundSaleDialog
                open={refundOpen}
                onOpenChange={setRefundOpen}
                saleId={sale.id}
                saleNumber={sale.sale_number}
                paid={sale.amount_paid}
            />
        </div>
    );
}
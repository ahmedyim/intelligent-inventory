import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDateTime, formatMoney } from '@/lib/format';
import { formatDay } from '@/lib/sales';
import type { CreatedSale } from '@/types';
import type { CartLine } from './salePlan';

export interface ReceiptData {
    sale: CreatedSale;
    lines: CartLine[]; // names come from the cart, the response only has product ids
    change: number;
    customerName: string | null;
}

interface Props {
    receipt: ReceiptData | null;
    viewHref: string | null; // admins can open the sale; sellers cannot
    onClose: () => void;
}

export default function SaleReceiptDialog({ receipt, viewHref, onClose }: Props) {
    return (
        <Dialog open={receipt !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                {receipt && (
                    <>
                        <DialogHeader>
                            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                                <CheckCircle2 className="h-6 w-6" />
                            </span>
                            <DialogTitle className="text-center">Sale completed</DialogTitle>
                            <DialogDescription className="text-center">
                                <span className="font-mono">{receipt.sale.sale_number}</span> - {formatDateTime(receipt.sale.created_at)}
                                {receipt.customerName && <span className="block">{receipt.customerName}</span>}
                            </DialogDescription>
                        </DialogHeader>

                        <ul className="divide-y rounded-lg border px-3 text-sm">
                            {receipt.sale.items.map((i) => {
                                const line = receipt.lines.find((l) => l.product_id === i.product_id);
                                return (
                                    <li key={i.id} className="flex items-baseline justify-between gap-3 py-2">
                                        <span className="min-w-0 truncate">
                                            {line?.name ?? 'Product'} <span className="text-muted-foreground">x {i.quantity}</span>
                                        </span>
                                        <span className="tabular-nums">{formatMoney(Number(i.line_total))}</span>
                                    </li>
                                );
                            })}
                        </ul>

                        <dl className="space-y-1.5 text-sm">
                            {Number(receipt.sale.discount) > 0 && (
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Discount</dt>
                                    <dd className="tabular-nums">- {formatMoney(Number(receipt.sale.discount))}</dd>
                                </div>
                            )}
                            <div className="flex items-baseline justify-between">
                                <dt className="font-medium">Total</dt>
                                <dd className="text-lg font-bold tabular-nums">{formatMoney(Number(receipt.sale.total))}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-muted-foreground">Paid</dt>
                                <dd className="tabular-nums">{formatMoney(Number(receipt.sale.amount_paid))}</dd>
                            </div>
                            {receipt.change > 0 && (
                                <div className="flex justify-between text-emerald-700">
                                    <dt>Change to give</dt>
                                    <dd className="font-medium tabular-nums">{formatMoney(receipt.change)}</dd>
                                </div>
                            )}
                            {Number(receipt.sale.balance_due) > 0 && (
                                <div className="flex justify-between text-amber-700">
                                    <dt>On credit{receipt.sale.due_date && `, due ${formatDay(receipt.sale.due_date)}`}</dt>
                                    <dd className="font-medium tabular-nums">{formatMoney(Number(receipt.sale.balance_due))}</dd>
                                </div>
                            )}
                        </dl>

                        <DialogFooter className="gap-2 sm:justify-between">
                            {viewHref ? (
                                <Button asChild variant="outline">
                                    <Link to={viewHref}>View sale</Link>
                                </Button>
                            ) : (
                                <span />
                            )}
                            <Button onClick={onClose} className="bg-orange-600 hover:bg-orange-700">
                                New sale
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
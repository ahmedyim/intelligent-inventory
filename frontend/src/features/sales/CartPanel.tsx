import { Minus, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import ProductImage from '@/components/ProductImage';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PaymentMethod } from '@/types';
import CustomerPicker from './CustomerPicker';
import type { SalePlan } from './salePlan';
import type { SaleDraft } from './useSaleDraft';

interface Props {
    draft: SaleDraft;
    plan: SalePlan;
    methods: PaymentMethod[];
    blocker: string | null;
    submitting: boolean;
    onComplete: () => void;
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="flex items-baseline justify-between">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn('font-medium tabular-nums', tone)}>{value}</dd>
        </div>
    );
}

export default function CartPanel({ draft, plan, methods, blocker, submitting, onComplete }: Props) {
    const empty = draft.lines.length === 0;
    const onCredit = plan.balance > 0;
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
                {empty ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                        The cart is empty. Tap a product, or scan a barcode, to add it.
                    </p>
                ) : (
                    <>
                        <ul className="divide-y">
                            {draft.lines.map((l) => (
                                <li key={l.product_id} className="flex gap-3 py-3 first:pt-0">
                                    <ProductImage src={l.image_url} alt={l.name} className="h-12 w-12" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{l.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatMoney(l.price)} / {l.unit}
                                        </p>
                                        <div className="mt-2 flex items-center gap-1.5">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                disabled={l.qty <= 1}
                                                onClick={() => draft.setQty(l.product_id, l.qty - 1)}
                                                aria-label={`Decrease ${l.name}`}
                                            >
                                                <Minus className="h-3.5 w-3.5" />
                                            </Button>
                                            <Input
                                                type="number"
                                                inputMode="numeric"
                                                min={1}
                                                max={l.stock}
                                                value={l.qty}
                                                onChange={(e) => draft.setQty(l.product_id, Number(e.target.value))}
                                                aria-label={`Quantity of ${l.name}`}
                                                className="h-8 w-14 px-1 text-center"
                                            />
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                disabled={l.qty >= l.stock}
                                                onClick={() => draft.setQty(l.product_id, l.qty + 1)}
                                                aria-label={`Increase ${l.name}`}
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                            </Button>
                                            <span className="text-xs text-muted-foreground">of {l.stock}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end justify-between">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-zinc-500"
                                            onClick={() => draft.removeLine(l.product_id)}
                                            aria-label={`Remove ${l.name}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                        <p className="text-sm font-semibold tabular-nums">{formatMoney(l.price * l.qty)}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        {/* Discount */}
                        <div className="space-y-1.5">
                            <Label htmlFor="pos-discount">Discount (whole sale)</Label>
                            <Input
                                id="pos-discount"
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                placeholder="0"
                                value={draft.discount}
                                onChange={(e) => draft.setDiscount(e.target.value)}
                            />
                        </div>

                        {/* Payments */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Payment</Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-orange-600"
                                    onClick={draft.addPayment}
                                    disabled={methods.length === 0}
                                >
                                    <Plus className="mr-1 h-3.5 w-3.5" /> Add payment
                                </Button>
                            </div>

                            {draft.payments.length === 0 && (
                                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                                    No payment line. The whole amount goes on credit.
                                </p>
                            )}

                            {draft.payments.map((row) => {
                                const method = methods.find((m) => m.id === row.methodId);
                                return (
                                    <div key={row.key} className="space-y-2 rounded-lg border p-2.5">
                                        <div className="flex items-center gap-2">
                                            <Select value={row.methodId} onValueChange={(v) => draft.updatePayment(row.key, { methodId: v })}>
                                                <SelectTrigger className="flex-1" aria-label="Payment method">
                                                    <SelectValue placeholder="Method" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {methods.map((m) => (
                                                        <SelectItem key={m.id} value={m.id}>
                                                            {m.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Input
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                step="0.01"
                                                placeholder="Rest"
                                                value={row.amount}
                                                onChange={(e) => draft.updatePayment(row.key, { amount: e.target.value })}
                                                aria-label="Amount"
                                                className="w-28"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 shrink-0 text-zinc-500"
                                                onClick={() => draft.removePayment(row.key)}
                                                aria-label="Remove payment line"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        {method?.requires_reference && (
                                            <Input
                                                placeholder={`${method.name} transaction reference`}
                                                value={row.reference}
                                                onChange={(e) => draft.updatePayment(row.key, { reference: e.target.value })}
                                                aria-label="Transaction reference"
                                                maxLength={100}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                            {methods.length === 0 && (
                                <p className="text-xs text-muted-foreground">No active payment methods were found.</p>
                            )}
                        </div>

                        {/* Credit: customer and due date */}
                        {onCredit && (
                            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                                <p className="text-sm font-medium text-amber-900">
                                    {formatMoney(plan.balance)} will be on credit
                                </p>
                                <CustomerPicker value={draft.customer} onChange={draft.setCustomer} />
                                <div className="space-y-1.5">
                                    <Label htmlFor="pos-due">Due date</Label>
                                    <Input
                                        id="pos-due"
                                        type="date"
                                        min={today}
                                        value={draft.dueDate}
                                        onChange={(e) => draft.setDueDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Optional customer for paid sales */}
                        {!onCredit && (
                            <div className="space-y-1.5">
                                <Label>Customer (optional)</Label>
                                <CustomerPicker value={draft.customer} onChange={draft.setCustomer} />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="pos-note">Note (optional)</Label>
                            <Textarea
                                id="pos-note"
                                rows={2}
                                maxLength={300}
                                value={draft.note}
                                onChange={(e) => draft.setNote(e.target.value)}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Totals and the button */}
            <div className="space-y-3 border-t bg-white p-4">
                <dl className="space-y-1.5 text-sm">
                    <Line label="Subtotal" value={formatMoney(plan.subtotal)} />
                    {plan.discount > 0 && <Line label="Discount" value={`- ${formatMoney(plan.discount)}`} />}
                    <div className="flex items-baseline justify-between border-t pt-2">
                        <dt className="font-medium">Total</dt>
                        <dd className="text-xl font-bold tabular-nums">{formatMoney(plan.total)}</dd>
                    </div>
                    {!empty && <Line label="Paid now" value={formatMoney(plan.paid)} />}
                    {plan.change > 0 && <Line label="Change to give" value={formatMoney(plan.change)} tone="text-emerald-700" />}
                    {onCredit && <Line label="On credit" value={formatMoney(plan.balance)} tone="text-amber-700" />}
                </dl>

                {!empty && blocker && (
                    <p role="status" className="text-sm text-amber-700">
                        {blocker}
                    </p>
                )}

                <Button
                    className="h-11 w-full bg-orange-600 text-base hover:bg-orange-700"
                    disabled={empty || blocker !== null || submitting}
                    onClick={onComplete}
                >
                    {submitting ? 'Saving...' : onCredit ? 'Complete sale (credit)' : 'Complete sale'}
                </Button>
            </div>
        </div>
    );
}
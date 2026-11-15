import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
// TODO: adjust this path if your inventory api file lives somewhere else.
import {
    useAdjustStockMutation,
    useGetMovementsQuery,
    useIssueStockMutation,
    useReceiveStockMutation,
    useUpdateInventoryMutation,
} from '@/features/inventory/inventoryApi';

// What GET /inventory returns for each row (InventoryWithProduct on the backend).
export type StockRow = {
    id: string;
    product_id: string;
    branch_id: string;
    quantity: number;
    reorder_level: number | null; // this branch's own level; null = use the product's default
    last_counted_at?: string | null;
    updated_at: string;
    product: { id: string; name: string; sku: string; reorder_level?: number | null };
};

// Same rule as the backend low-stock query: the branch level, else the product default.
export const effectiveLevel = (i: StockRow): number | null => i.reorder_level ?? i.product.reorder_level ?? null;

export type StockMode = 'receive' | 'issue' | 'adjust' | 'reorder';

// "sale" is also accepted by the backend, but sales reduce stock at the till, not by hand.
type IssueReason = 'damage' | 'loss' | 'expired' | 'other';

const COPY: Record<StockMode, { title: string; description: string; button: string }> = {
    receive: {
        title: 'Receive stock',
        description: 'Add a delivery to the stock of your branch.',
        button: 'Add stock',
    },
    issue: {
        title: 'Remove stock',
        description: 'Take stock out because it was damaged, lost or expired. Sales are removed automatically at the till.',
        button: 'Remove stock',
    },
    adjust: {
        title: 'Count stock',
        description: 'Enter what you counted on the shelf. The system quantity is replaced by this number.',
        button: 'Save count',
    },
    reorder: {
        title: 'Reorder level',
        description: 'You are marked "Low stock" when the quantity falls to this number or below.',
        button: 'Save level',
    },
};

const REASONS: { value: IssueReason; label: string }[] = [
    { value: 'damage', label: 'Damaged' },
    { value: 'loss', label: 'Lost' },
    { value: 'expired', label: 'Expired' },
    { value: 'other', label: 'Other' },
];

const isWhole = (v: string) => /^\d+$/.test(v.trim());
const isMoney = (v: string) => /^\d+(\.\d{1,4})?$/.test(v.trim());

type ActionProps = {
    mode: StockMode | null;
    item: StockRow | null;
    branchId: string;
    onClose: () => void;
};

export function StockActionDialog({ mode, item, branchId, onClose }: ActionProps) {
    const [receive, { isLoading: receiving }] = useReceiveStockMutation();
    const [issue, { isLoading: issuing }] = useIssueStockMutation();
    const [adjust, { isLoading: adjusting }] = useAdjustStockMutation();
    const [updateInventory, { isLoading: savingLevel }] = useUpdateInventoryMutation();
    const busy = receiving || issuing || adjusting || savingLevel;

    const [quantity, setQuantity] = useState('');
    const [unitCost, setUnitCost] = useState('');
    const [reason, setReason] = useState<IssueReason>('damage');
    const [counted, setCounted] = useState('');
    const [level, setLevel] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Start with a clean form every time the dialog opens.
    useEffect(() => {
        if (!mode || !item) return;
        setQuantity('');
        setUnitCost('');
        setReason('damage');
        setCounted(String(item.quantity));
        setLevel(item.reorder_level == null ? '' : String(item.reorder_level));
        setNote('');
        setError(null);
    }, [mode, item]);

    if (!mode || !item) return null;
    const copy = COPY[mode];

    const qtyNum = Number(quantity);
    const countedNum = Number(counted);
    const valid =
        mode === 'receive'
            ? isWhole(quantity) && qtyNum > 0 && isMoney(unitCost)
            : mode === 'issue'
                ? isWhole(quantity) && qtyNum > 0 && qtyNum <= item.quantity
                : mode === 'adjust'
                    ? isWhole(counted)
                    : level.trim() === '' || isWhole(level);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!valid || busy) return;
        setError(null);
        const base = { product_id: item.product_id, branch_id: branchId };
        const cleanNote = note.trim() || undefined;

        try {
            if (mode === 'receive') {
                await receive({
                    ...base,
                    quantity: qtyNum,
                    // The backend accepts a decimal string. The cast keeps TypeScript happy whatever your body type says.
                    unit_cost: unitCost.trim() as unknown as Parameters<typeof receive>[0]['unit_cost'],
                    reason: 'purchase',
                    note: cleanNote,
                }).unwrap();
                toast.success(`Added ${qtyNum} to ${item.product.name}`);
            } else if (mode === 'issue') {
                await issue({ ...base, quantity: qtyNum, reason, note: cleanNote }).unwrap();
                toast.success(`Removed ${qtyNum} from ${item.product.name}`);
            } else if (mode === 'adjust') {
                await adjust({ ...base, counted_quantity: countedNum, note: cleanNote }).unwrap();
                toast.success('Count saved');
            } else {
                await updateInventory({ id: item.id, reorder_level: level.trim() === '' ? null : Number(level) }).unwrap();
                toast.success('Reorder level saved');
            }
            onClose();
        } catch (err) {
            setError(getErrorMessage(err, 'Could not save. Please try again.'));
        }
    };

    const diff = countedNum - item.quantity;
    const productDefault = item.product.reorder_level;

    return (
        <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription>{copy.description}</DialogDescription>
                </DialogHeader>

                <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm">
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-muted-foreground">
                        {item.product.sku} - in stock: <span className="font-medium text-foreground">{item.quantity}</span>
                    </p>
                </div>

                <form onSubmit={onSubmit} className="space-y-4">
                    {(mode === 'receive' || mode === 'issue') && (
                        <div className="space-y-2">
                            <Label htmlFor="stock-qty">Quantity</Label>
                            <Input
                                id="stock-qty"
                                inputMode="numeric"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                autoFocus
                            />
                            {mode === 'issue' && quantity !== '' && qtyNum > item.quantity && (
                                <p className="text-xs text-red-600">You only have {item.quantity} in stock.</p>
                            )}
                        </div>
                    )}

                    {mode === 'receive' && (
                        <div className="space-y-2">
                            <Label htmlFor="stock-cost">Cost per unit (this delivery)</Label>
                            <Input
                                id="stock-cost"
                                inputMode="decimal"
                                value={unitCost}
                                onChange={(e) => setUnitCost(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                The product's average cost is updated from this. The selling price does not change.
                            </p>
                        </div>
                    )}

                    {mode === 'issue' && (
                        <div className="space-y-2">
                            <Label>Reason</Label>
                            <Select value={reason} onValueChange={(v) => setReason(v as IssueReason)}>
                                <SelectTrigger aria-label="Reason">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {REASONS.map((r) => (
                                        <SelectItem key={r.value} value={r.value}>
                                            {r.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {mode === 'adjust' && (
                        <div className="space-y-2">
                            <Label htmlFor="stock-counted">Counted quantity</Label>
                            <Input
                                id="stock-counted"
                                inputMode="numeric"
                                value={counted}
                                onChange={(e) => setCounted(e.target.value)}
                                autoFocus
                            />
                            {isWhole(counted) && (
                                <p className="text-xs text-muted-foreground">
                                    {diff === 0 ? 'Same as the system.' : `${diff > 0 ? '+' : ''}${diff} compared with the system.`}
                                </p>
                            )}
                        </div>
                    )}

                    {mode === 'reorder' && (
                        <div className="space-y-2">
                            <Label htmlFor="stock-level">Alert when quantity is at or below</Label>
                            <Input
                                id="stock-level"
                                inputMode="numeric"
                                value={level}
                                onChange={(e) => setLevel(e.target.value)}
                                placeholder={productDefault != null ? `Product default: ${productDefault}` : 'No alert'}
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground">
                                Leave it empty to use the product's default level{productDefault != null ? ` (${productDefault})` : ''}.
                            </p>
                        </div>
                    )}

                    {mode !== 'reorder' && (
                        <div className="space-y-2">
                            <Label htmlFor="stock-note">Note (optional)</Label>
                            <Input id="stock-note" value={note} onChange={(e) => setNote(e.target.value)} />
                        </div>
                    )}

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-orange-600 hover:bg-orange-700" disabled={!valid || busy}>
                            {busy ? 'Saving...' : copy.button}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

const TYPE_STYLE: Record<string, string> = {
    IN: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    OUT: 'border-red-200 bg-red-50 text-red-700',
    ADJUSTMENT: 'border-amber-200 bg-amber-50 text-amber-700',
};

export function MovementsDialog({
    item,
    branchId,
    onClose,
}: {
    item: StockRow | null;
    branchId: string;
    onClose: () => void;
}) {
    const { data, isLoading, isError, refetch } = useGetMovementsQuery(
        { branch_id: branchId, product_id: item?.product_id, skip: 0, limit: 50 },
        { skip: !item }
    );

    if (!item) return null;
    const rows = data?.items ?? [];

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Stock history</DialogTitle>
                    <DialogDescription>
                        {item.product.name} ({item.product.sku}) - the latest 50 movements
                    </DialogDescription>
                </DialogHeader>

                {isError ? (
                    <div className="p-4 text-center">
                        <p className="mb-3 text-sm text-muted-foreground">Could not load the history.</p>
                        <Button variant="outline" size="sm" onClick={() => refetch()}>
                            Try again
                        </Button>
                    </div>
                ) : isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">No movements yet.</p>
                ) : (
                    <div className="max-h-[60vh] overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>When</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Change</TableHead>
                                    <TableHead className="text-right">Before - After</TableHead>
                                    <TableHead>Reason</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((m) => (
                                    <TableRow key={m.id}>
                                        <TableCell className="whitespace-nowrap text-sm">{formatDateTime(m.created_at)}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={cn(TYPE_STYLE[m.movement_type])}>
                                                {m.movement_type === 'ADJUSTMENT' ? 'Count' : m.movement_type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell
                                            className={cn(
                                                'text-right font-medium',
                                                m.quantity_change > 0 ? 'text-emerald-700' : m.quantity_change < 0 ? 'text-red-700' : ''
                                            )}
                                        >
                                            {m.quantity_change > 0 ? '+' : ''}
                                            {m.quantity_change}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                                            {m.quantity_before} - {m.quantity_after}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            <span className="capitalize">{m.reason.replace(/_/g, ' ')}</span>
                                            {m.note && <span className="block text-xs text-muted-foreground">{m.note}</span>}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { useRefundSaleMutation } from './sellerApi';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    saleId: string;
    saleNumber: string;
    paid: number;
}

export default function RefundSaleDialog({ open, onOpenChange, saleId, saleNumber, paid }: Props) {
    const [reason, setReason] = useState('');
    const [refund, { isLoading }] = useRefundSaleMutation();
    const valid = reason.trim().length >= 3;

    const submit = async () => {
        if (!valid) return;
        try {
            await refund({ id: saleId, reason: reason.trim() }).unwrap();
            toast.success(`Sale ${saleNumber} refunded`);
            setReason('');
            onOpenChange(false);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not refund the sale'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !isLoading && onOpenChange(o)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Refund sale {saleNumber}?</DialogTitle>
                    <DialogDescription>
                        All items go back into stock
                        {paid > 0 ? ` and ${formatMoney(paid)} is recorded as given back to the customer.` : '.'} This cannot be
                        undone.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <Label htmlFor="refund-reason">Reason (required)</Label>
                    <Textarea
                        id="refund-reason"
                        rows={3}
                        maxLength={300}
                        placeholder="For example: customer returned the item"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={!valid || isLoading} className="bg-red-600 text-white hover:bg-red-700">
                        {isLoading ? 'Refunding...' : 'Refund sale'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
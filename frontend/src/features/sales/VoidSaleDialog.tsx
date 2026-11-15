import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { useVoidSaleMutation } from './salesApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  saleNumber: string;
  paid: number;
}

export default function VoidSaleDialog({ open, onOpenChange, saleId, saleNumber, paid }: Props) {
  const [reason, setReason] = useState('');
  const [voidSale, { isLoading }] = useVoidSaleMutation();

  const submit = async () => {
    try {
      await voidSale({ id: saleId, reason: reason.trim() }).unwrap();
      toast.success(`Sale ${saleNumber} voided`);
      setReason('');
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not void the sale'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isLoading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void sale {saleNumber}?</DialogTitle>
          <DialogDescription>
            The items go back into stock
            {paid > 0 ? ` and ${formatMoney(paid)} is recorded as refunded.` : '.'} A voided sale cannot be restored.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="void-reason">Reason (optional)</Label>
          <Textarea id="void-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isLoading} className="bg-red-600 text-white hover:bg-red-700">
            {isLoading ? 'Voiding...' : 'Void sale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
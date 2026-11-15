import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/errors';
import type { Suggestion } from '@/types';
import { useApproveSuggestionMutation, useDismissSuggestionMutation } from './forecastApi';

export interface DecisionTarget {
  suggestion: Suggestion;
  mode: 'approve' | 'dismiss';
}

interface Props {
  target: DecisionTarget | null;
  onClose: () => void;
  onStale: () => void; // someone else already decided it: reload the list
}

export default function DecisionDialog({ target, onClose, onStale }: Props) {
  const [note, setNote] = useState('');
  const [approve, { isLoading: approving }] = useApproveSuggestionMutation();
  const [dismiss, { isLoading: dismissing }] = useDismissSuggestionMutation();
  const busy = approving || dismissing;

  const close = () => {
    if (busy) return;
    setNote('');
    onClose();
  };

  const submit = async () => {
    if (!target) return;
    const { suggestion, mode } = target;
    try {
      if (mode === 'approve') {
        await approve({ id: suggestion.id, note: note.trim() }).unwrap();
        toast.success('Approved. Receive the stock on the product when the delivery arrives.');
      } else {
        await dismiss({ id: suggestion.id, note: note.trim() }).unwrap();
        toast.success('Suggestion dismissed');
      }
      setNote('');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the decision'));
      if ((err as { status?: number })?.status === 409) {
        setNote('');
        onClose();
        onStale(); // already decided by someone else
      }
    }
  };

  const s = target?.suggestion;
  const approving_ = target?.mode === 'approve';
  const unit = s?.product?.unit ?? 'units';

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{approving_ ? 'Approve this reorder?' : 'Dismiss this suggestion?'}</DialogTitle>
          <DialogDescription>
            {approving_
              ? `Order ${s?.suggested_qty} ${unit} of ${s?.product?.name ?? 'this product'}. This records your decision and stops the product from being suggested again for 14 days. It does not create a purchase or add stock.`
              : `${s?.product?.name ?? 'This product'} will not be suggested for ordering from this run.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="decision-note">Note (optional)</Label>
          <Textarea
            id="decision-note"
            rows={3}
            maxLength={300}
            placeholder={approving_ ? 'For example: ordered from the usual supplier' : 'For example: seasonal item'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
            className={approving_ ? 'bg-orange-600 hover:bg-orange-700' : 'bg-zinc-800 text-white hover:bg-zinc-900'}
          >
            {busy ? 'Saving...' : approving_ ? 'Approve' : 'Dismiss'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
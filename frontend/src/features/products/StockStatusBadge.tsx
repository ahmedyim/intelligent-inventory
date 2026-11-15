import { cn } from '@/lib/utils';

export default function StockStatusBadge({ stock, reorder }: { stock: number; reorder: number }) {
  const out = stock <= 0;
  const low = !out && stock <= reorder;

  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        out ? 'bg-red-50 text-red-700' : low ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'
      )}
    >
      {out ? 'Out of stock' : low ? 'Low' : 'In stock'}
    </span>
  );
}
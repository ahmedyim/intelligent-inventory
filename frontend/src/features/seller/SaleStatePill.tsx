import { cn } from '@/lib/utils';

export default function SaleStatePill({ status }: { status: string }) {
  const refunded = String(status).toUpperCase() === 'VOIDED';
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        refunded ? 'bg-zinc-100 text-zinc-600' : 'bg-emerald-50 text-emerald-700'
      )}
    >
      {refunded ? 'Refunded' : 'Completed'}
    </span>
  );
}
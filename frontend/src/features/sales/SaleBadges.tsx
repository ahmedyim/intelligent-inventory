import { cn } from '@/lib/utils';

const SALE: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  VOIDED: 'bg-zinc-100 text-zinc-600',
};
const PAY: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  UNPAID: 'bg-red-50 text-red-700',
};

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function Pill({ value, styles }: { value: string; styles: Record<string, string> }) {
  const key = String(value).toUpperCase();
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        styles[key] ?? 'bg-zinc-100 text-zinc-700'
      )}
    >
      {label(key)}
    </span>
  );
}

export const SaleStatusBadge = ({ status }: { status: string }) => <Pill value={status} styles={SALE} />;
export const PaymentStatusBadge = ({ status }: { status: string }) => <Pill value={status} styles={PAY} />;
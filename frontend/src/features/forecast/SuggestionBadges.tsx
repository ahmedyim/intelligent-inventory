import { cn } from '@/lib/utils';

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');

// The Urgency enum of the backend, most urgent first. Keep it in sync with app/models/forecast.py.
export const URGENCY_LEVELS = ['CRITICAL', 'SOON'] as const;

export const urgencyLabel = (value: string) => label(value);

const URGENCY: Record<string, string> = {
    CRITICAL: 'bg-red-50 text-red-700',
    SOON: 'bg-amber-50 text-amber-700',
};

// Confidence enum: LOW, MEDIUM, HIGH
const CONFIDENCE: Record<string, string> = {
    HIGH: 'bg-emerald-50 text-emerald-700',
    MEDIUM: 'bg-amber-50 text-amber-700',
    LOW: 'bg-zinc-100 text-zinc-600',
};

function Pill({ value, styles }: { value: string; styles: Record<string, string> }) {
    const key = String(value).toUpperCase();
    return (
        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', styles[key] ?? 'bg-zinc-100 text-zinc-700')}>
            {label(key)}
        </span>
    );
}

export const UrgencyBadge = ({ value }: { value: string }) => <Pill value={value} styles={URGENCY} />;
export const ConfidenceBadge = ({ value }: { value: string }) => <Pill value={value} styles={CONFIDENCE} />;
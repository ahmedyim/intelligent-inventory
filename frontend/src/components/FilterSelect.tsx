import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
    allLabel: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    className?: string;
}
export default function FilterSelect({ allLabel, value, onChange, options, className = 'w-44' }: Props) {
    return (
        <Select value={value || 'all'} onValueChange={(v) => onChange(v === 'all' ? '' : v)}>
            <SelectTrigger className={className} aria-label={allLabel}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">{allLabel}</SelectItem>
                {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
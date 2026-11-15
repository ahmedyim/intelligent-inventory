import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatMoney } from '@/lib/format';
import type { Customer } from '@/types';
import { useSearchCustomersQuery } from './posApi';
import type { CustomerPick } from './useSaleDraft';

export const customerName = (c: Customer) => c.full_name || c.name || 'Unnamed customer';

function limitOf(c: Customer): number | null {
    const n = Number(c.credit_limit);
    return c.credit_limit != null && Number.isFinite(n) ? n : null;
}

interface Props {
    value: CustomerPick | null;
    onChange: (customer: CustomerPick | null) => void;
}

export default function CustomerPicker({ value, onChange }: Props) {
    const [term, setTerm] = useState('');
    const query = useDebouncedValue(term, 300).trim();
    const { data = [], isFetching, isError } = useSearchCustomersQuery(query, { skip: query.length < 2 });

    if (value) {
        return (
            <div className="flex items-center justify-between gap-2 rounded-lg border bg-zinc-50 p-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{value.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                        {value.phone || 'No phone'}
                        {value.creditLimit != null && ` - credit limit ${formatMoney(value.creditLimit)}`}
                    </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(null)} aria-label="Remove customer">
                    <X className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                    type="search"
                    aria-label="Find a customer"
                    placeholder="Find a customer by name or phone"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className="pl-9"
                />
            </div>

            {query.length >= 2 && (
                <div className="overflow-hidden rounded-lg border">
                    {isError ? (
                        <p className="p-3 text-sm text-red-600">Could not search customers.</p>
                    ) : isFetching ? (
                        <p className="p-3 text-sm text-muted-foreground">Searching...</p>
                    ) : data.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">No customer found.</p>
                    ) : (
                        <ul className="divide-y">
                            {data.map((c) => (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        className="w-full p-3 text-left hover:bg-orange-50 focus-visible:bg-orange-50 focus-visible:outline-none"
                                        onClick={() => {
                                            onChange({ id: c.id, name: customerName(c), phone: c.phone, creditLimit: limitOf(c) });
                                            setTerm('');
                                        }}
                                    >
                                        <p className="text-sm font-medium">{customerName(c)}</p>
                                        <p className="text-xs text-muted-foreground">{c.phone || 'No phone'}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
import { useEffect, useRef, useState } from 'react';
import type { CartLine, PaymentRow } from './salePlan';

export interface CustomerPick {
    id: string;
    name: string;
    phone?: string | null;
    creditLimit?: number | null;
}

let rowCounter = 0;
const newRow = (methodId: string): PaymentRow => ({
    key: `pay-${++rowCounter}`,
    methodId,
    amount: '',
    reference: '',
});

export function useSaleDraft(defaultMethodId: string | undefined) {
    const [lines, setLines] = useState<CartLine[]>([]);
    const [discount, setDiscount] = useState('');
    const [customer, setCustomer] = useState<CustomerPick | null>(null);
    const [dueDate, setDueDate] = useState('');
    const [note, setNote] = useState('');
    const [payments, setPayments] = useState<PaymentRow[]>([]);

    // Start with one payment line as soon as the payment methods are known.
    // After that the user decides: removing every line means "all on credit".
    const seeded = useRef(false);
    useEffect(() => {
        if (!seeded.current && defaultMethodId) {
            seeded.current = true;
            setPayments([newRow(defaultMethodId)]);
        }
    }, [defaultMethodId]);

    const addProduct = (line: Omit<CartLine, 'qty'>): 'added' | 'max' => {
        const current = lines.find((l) => l.product_id === line.product_id)?.qty ?? 0;
        if (line.stock <= current) return 'max';

        setLines((prev) => {
            const i = prev.findIndex((l) => l.product_id === line.product_id);
            if (i === -1) return [...prev, { ...line, qty: 1 }];
            return prev.map((l, idx) =>
                idx === i ? { ...l, stock: line.stock, qty: Math.min(line.stock, l.qty + 1) } : l
            );
        });
        return 'added';
    };

    const setQty = (productId: string, qty: number) => {
        if (!Number.isFinite(qty)) return;
        setLines((prev) =>
            prev.map((l) =>
                l.product_id === productId ? { ...l, qty: Math.max(1, Math.min(l.stock, Math.floor(qty))) } : l
            )
        );
    };

    const removeLine = (productId: string) => setLines((prev) => prev.filter((l) => l.product_id !== productId));

    const updatePayment = (key: string, patch: Partial<Omit<PaymentRow, 'key'>>) =>
        setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

    const addPayment = () => {
        if (defaultMethodId) setPayments((prev) => [...prev, newRow(defaultMethodId)]);
    };

    const removePayment = (key: string) => setPayments((prev) => prev.filter((p) => p.key !== key));

    const reset = () => {
        setLines([]);
        setDiscount('');
        setCustomer(null);
        setDueDate('');
        setNote('');
        setPayments(defaultMethodId ? [newRow(defaultMethodId)] : []);
    };

    return {
        lines, discount, setDiscount, customer, setCustomer, dueDate, setDueDate, note, setNote,
        payments, addProduct, setQty, removeLine, updatePayment, addPayment, removePayment, reset,
    };
}

export type SaleDraft = ReturnType<typeof useSaleDraft>;
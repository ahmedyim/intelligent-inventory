import type { PaymentMethod } from '@/types';

export interface CartLine {
  product_id: string;
  name: string;
  sku: string;
  unit: string;
  image_url?: string | null;
  price: number;
  stock: number; // quantity available in this branch
  qty: number;
}

// amount '' means "the rest of the total"
export interface PaymentRow {
  key: string;
  methodId: string;
  amount: string;
  reference: string;
}

export interface PlannedPayment {
  payment_method_id: string;
  amount: number;
  reference: string | null;
}

export interface SalePlan {
  subtotal: number;
  discount: number;
  total: number;
  payments: PlannedPayment[];
  paid: number;
  balance: number; // > 0 means credit
  change: number; // cash to give back (a single line paid with more than the total)
  errors: string[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function planSale(
  lines: CartLine[],
  discountText: string,
  rows: PaymentRow[],
  methods: PaymentMethod[]
): SalePlan {
  const errors: string[] = [];
  const subtotal = cents(lines.reduce((sum, l) => sum + l.price * l.qty, 0));

  // ---- discount
  let discount = 0;
  if (discountText.trim() !== '') {
    const n = Number(discountText);
    if (!Number.isFinite(n) || n < 0) errors.push('Discount must be 0 or more.');
    else if (cents(n) > subtotal) errors.push('Discount is more than the subtotal.');
    else discount = cents(n);
  }
  const total = cents(subtotal - discount);

  // ---- payment lines
  const explicit = new Map<PaymentRow, number>();
  const blanks: PaymentRow[] = [];
  for (const row of rows) {
    if (row.amount.trim() === '') {
      blanks.push(row);
      continue;
    }
    const n = Number(row.amount);
    if (!Number.isFinite(n) || n <= 0) errors.push('Enter a valid payment amount.');
    else explicit.set(row, cents(n));
  }
  if (blanks.length > 1) errors.push('Only one payment line can be left empty. It pays the rest.');

  const explicitSum = cents([...explicit.values()].reduce((sum, a) => sum + a, 0));
  const rest = cents(total - explicitSum);

  const built: { row: PaymentRow; amount: number }[] = [];
  for (const row of rows) {
    const amount = explicit.get(row);
    if (amount !== undefined) built.push({ row, amount });
    else if (blanks.length === 1 && blanks[0] === row) {
      if (rest <= 0) errors.push('Remove the empty payment line. The total is already covered.');
      else built.push({ row, amount: rest });
    }
  }

  let paid = cents(built.reduce((sum, b) => sum + b.amount, 0));
  let change = 0;
  if (paid > total) {
    if (rows.length === 1 && built.length === 1) {
      // cash handed over is more than the total: the sale takes the total, the rest is change
      change = cents(paid - total);
      built[0] = { row: built[0].row, amount: total };
      paid = total;
    } else {
      errors.push('The payments add up to more than the total.');
    }
  }

  // ---- method checks
  const payments: PlannedPayment[] = built.map(({ row, amount }) => {
    const method = methods.find((m) => m.id === row.methodId);
    if (!method) errors.push('Choose a payment method.');
    else if (method.requires_reference && row.reference.trim() === '') {
      errors.push(`Enter the transaction reference for ${method.name}.`);
    }
    return { payment_method_id: row.methodId, amount, reference: row.reference.trim() || null };
  });

  return {
    subtotal,
    discount,
    total,
    payments,
    paid,
    balance: cents(total - paid),
    change,
    errors: [...new Set(errors)],
  };
}
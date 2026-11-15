import type { InventoryRow } from './inventory';
import type { Product } from './product';

export interface InventoryWithProduct extends InventoryRow {
    product: Product;
}

export interface StockList {
    items: InventoryWithProduct[];
    total: number;
    skip: number;
    limit: number;
}

export interface PaymentMethod {
    id: string;
    name: string;
    code: string;
    requires_reference?: boolean;
    is_active?: boolean;
}

export interface Customer {
    id: string;
    full_name?: string | null;
    name?: string | null;
    phone?: string | null;
    credit_limit?: string | number | null;
    is_active?: boolean;
}

export interface SalePaymentPayload {
    payment_method_id: string;
    amount: number;
    reference?: string | null;
}

export interface SaleCreatePayload {
    branch_id: string;
    items: { product_id: string; quantity: number }[];
    discount: number;
    payments: SalePaymentPayload[];
    customer_id?: string | null;
    due_date?: string | null; // "2026-12-01"
    note?: string | null;
}

// What the receipt needs from POST /sales (Decimals arrive as strings)
export interface CreatedSaleItem {
    id: string;
    product_id: string;
    quantity: number;
    unit_price: string;
    line_total: string;
}

export interface CreatedSale {
    id: string;
    sale_number: string;
    subtotal: string;
    discount: string;
    total: string;
    amount_paid: string;
    balance_due: string;
    due_date?: string | null;
    created_at: string;
    items: CreatedSaleItem[];
}
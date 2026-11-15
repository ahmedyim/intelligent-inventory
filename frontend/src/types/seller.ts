import type { MethodSummary, SalePaymentStatus, SaleStatus, SalesPeriod } from './sale';

// Products for the POS and the seller catalog. The API never sends cost.
export interface PosProduct {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  unit: string;
  image_url?: string | null;
  selling_price: number;
  reorder_level: number;
  is_active: boolean;
}

export interface PosStockItem {
  id: string;
  branch_id: string;
  quantity: number;
  reorder_level: number | null;
  product: PosProduct;
}

export interface PosStockList {
  items: PosStockItem[];
  total: number;
  skip: number;
  limit: number;
}

export interface MySaleRow {
  id: string;
  sale_number: string;
  customer_name?: string | null;
  status: SaleStatus;
  payment_status: SalePaymentStatus;
  payment_method: string;
  total: number;
  discount: number;
  amount_paid: number;
  balance_due: number;
  due_date?: string | null;
  items_count: number;
  units: number;
  created_at: string;
  can_refund: boolean;
}

export interface MySalesSummary {
  sales_count: number;
  total: number;
  discount: number;
  paid: number;
  balance_due: number;
  overdue_count: number;
  overdue_amount: number;
  voided_count: number;
  voided_total: number;
  by_method: MethodSummary[];
}

export interface MySalesOverview {
  items: MySaleRow[];
  total: number;
  skip: number;
  limit: number;
  summary: MySalesSummary;
  methods: string[];
  window_start?: string | null;
  window_end?: string | null;
  refund_window_hours: number;
}

export interface ReceiptItem {
  id: string;
  product_id: string;
  product_name?: string | null;
  sku?: string | null;
  image_url?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface ReceiptPayment {
  id: string;
  method: string;
  amount: number;
  reference?: string | null;
  note?: string | null;
  received_by_name?: string | null;
  created_at: string;
}

export interface SaleReceipt {
  id: string;
  sale_number: string;
  branch_id: string;
  branch_name?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  staff_id?: string | null;
  staff_name?: string | null;
  status: SaleStatus;
  payment_status: SalePaymentStatus;
  payment_method: string;
  note?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  due_date?: string | null;
  created_at: string;
  voided_at?: string | null;
  voided_by_name?: string | null;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
  can_refund: boolean;
  refund_deadline?: string | null;
  refund_blocked_reason?: string | null;
}

export interface MySalesQuery {
  period?: SalesPeriod;
  date_from?: string;
  date_to?: string;
  status?: SaleStatus;
  payment_status?: SalePaymentStatus;
  payment_method?: string;
  search?: string;
  skip?: number;
  limit?: number;
}
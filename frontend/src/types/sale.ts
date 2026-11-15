export type SalesPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'year' | 'all';
export type SaleStatus = 'COMPLETED' | 'VOIDED';
export type SalePaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface SaleRow {
  id: string;
  sale_number: string;
  branch_id: string;
  branch_name?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  staff_id?: string | null;
  staff_name?: string | null;
  status: SaleStatus;
  payment_status: SalePaymentStatus;
  payment_method: string;
  total: number;
  discount: number;
  amount_paid: number;
  balance_due: number;
  due_date?: string | null; // "2026-11-30"
  items_count: number;
  units: number;
  cost: number;
  profit: number;
  created_at: string;
}

export interface MethodSummary {
  method: string;
  total: number;
  count: number;
}

export interface SalesSummary {
  sales_count: number;
  revenue: number;
  cost: number;
  profit: number;
  discount: number;
  paid: number;
  balance_due: number;
  overdue_count: number;
  overdue_amount: number;
  voided_count: number;
  voided_total: number;
  by_method: MethodSummary[];
}

export interface SalesOverview {
  items: SaleRow[];
  total: number;
  skip: number;
  limit: number;
  summary: SalesSummary;
  methods: string[];
  window_start?: string | null;
  window_end?: string | null;
}

export interface SaleItemDetail {
  id: string;
  product_id: string;
  product_name?: string | null;
  sku?: string | null;
  image_url?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  profit: number;
}

export interface SalePaymentDetail {
  id: string;
  method: string;
  amount: number;
  reference?: string | null;
  note?: string | null;
  received_by_name?: string | null;
  created_at: string;
}

export interface SaleDetail {
  id: string;
  sale_number: string;
  branch_id: string;
  branch_name?: string | null;
  customer_id?: string | null;
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
  cost: number;
  profit: number;
  items: SaleItemDetail[];
  payments: SalePaymentDetail[];
}

export interface SalesQuery {
  period?: SalesPeriod;
  date_from?: string;
  date_to?: string;
  branch_id?: string;
  created_by?: string;
  customer_id?: string;
  status?: SaleStatus;
  payment_status?: SalePaymentStatus;
  payment_method?: string;
  search?: string;
  skip?: number;
  limit?: number;
}
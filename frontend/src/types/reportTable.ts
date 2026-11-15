import type { SalesPeriod } from './sale';

export type ReportKey =
    | 'sales'
    | 'by-staff'
    | 'by-branch'
    | 'by-product'
    | 'payments'
    | 'receivables'
    | 'stock';

export type ColumnType = 'text' | 'money' | 'int' | 'percent' | 'date' | 'datetime';

export interface ReportColumn {
    key: string;
    label: string;
    type: ColumnType;
}

export type ReportValue = string | number | null;

export interface ReportTable {
    key: ReportKey;
    title: string;
    uses_period: boolean;
    columns: ReportColumn[];
    rows: Record<string, ReportValue>[];
    totals?: Record<string, ReportValue> | null; // percent is a fraction (0.25 = 25%)
    total: number;
    skip: number;
    limit: number;
    truncated: boolean;
    filters: string[];
    methods: string[];
    window_start?: string | null;
    window_end?: string | null;
    generated_at: string;
}

export interface ReportQuery {
    key: ReportKey;
    period?: SalesPeriod;
    date_from?: string;
    date_to?: string;
    branch_id?: string;
    created_by?: string;
    payment_method?: string;
    skip?: number;
    limit?: number;
}
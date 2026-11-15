export type ReportPeriod = 'today' | 'week' | 'month';

export interface PeriodTotals {
  sales_count: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface SummaryReport extends PeriodTotals {
  previous: PeriodTotals; // same figures for the period before, used for the trend badges
  total_products: number;
  inventory_value: number;
  low_stock: number;
  out_of_stock: number;
}

export type TrendGranularity = 'day' | 'week' | 'month';

export interface TrendPoint {
  date: string; // "2026-11-03", the first day of the bucket
  revenue: number;
  cost: number;
  profit: number;
}

export interface SalesTrend {
  granularity: TrendGranularity;
  points: TrendPoint[];
}

export interface BranchRevenue {
  branch_id: string;
  branch_name: string;
  revenue: number;
  sales_count: number;
}
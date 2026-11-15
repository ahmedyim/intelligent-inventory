import type { ReportKey, SalesPeriod } from '@/types';

export interface ReportDef {
    key: ReportKey;
    label: string;
    group: 'Sales' | 'Money' | 'Inventory';
    description: string;
    period: boolean;
    branch: boolean;
    staff: boolean;
    method: boolean;
}

export const REPORTS: ReportDef[] = [
    {
        key: 'sales', label: 'Sales list', group: 'Sales', period: true, branch: true, staff: true, method: true,
        description: 'Every sale in the period with staff, customer, payment, cost and profit. Totals count completed sales only.',
    },
    {
        key: 'by-staff', label: 'By staff', group: 'Sales', period: true, branch: true, staff: false, method: false,
        description: 'How much each person sold, and how profitable it was.',
    },
    {
        key: 'by-branch', label: 'By branch', group: 'Sales', period: true, branch: false, staff: false, method: false,
        description: 'Compare branches: revenue, profit, money collected and money still owed.',
    },
    {
        key: 'by-product', label: 'By product', group: 'Sales', period: true, branch: true, staff: true, method: false,
        description: 'Best sellers and most profitable products. Sales value is before any whole-sale discount.',
    },
    {
        key: 'payments', label: 'Payments', group: 'Money', period: true, branch: true, staff: true, method: true,
        description: 'Money received and refunded per payment method, by the day the payment was made.',
    },
    {
        key: 'receivables', label: 'Receivables', group: 'Money', period: false, branch: true, staff: true, method: false,
        description: 'Credit sales that are not fully paid, oldest due date first.',
    },
    {
        key: 'stock', label: 'Stock valuation', group: 'Inventory', period: false, branch: true, staff: false, method: false,
        description: 'What is on the shelves now and what it is worth at average cost.',
    },
];

export const REPORT_GROUPS: ReportDef['group'][] = ['Sales', 'Money', 'Inventory'];

export const PERIOD_CHIPS: { value: SalesPeriod; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: 'last_month', label: 'Last month' },
    { value: 'year', label: 'This year' },
    { value: 'all', label: 'All time' },
];
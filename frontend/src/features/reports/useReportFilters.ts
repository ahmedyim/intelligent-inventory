import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ReportKey, SalesPeriod } from '@/types';
import { PERIOD_CHIPS, REPORTS } from './reportDefs';

export interface ReportFilters {
    report: ReportKey;
    period: SalesPeriod;
    from: string;
    to: string;
    staff: string;
    branch: string;
    method: string;
    page: number;
}

const DEFAULTS: ReportFilters = {
    report: 'sales',
    period: 'month',
    from: '',
    to: '',
    staff: '',
    branch: '',
    method: '',
    page: 0,
};

export function useReportFilters() {
    const [params, setParams] = useSearchParams();

    const filters = useMemo<ReportFilters>(() => {
        const report = params.get('report');
        const period = params.get('period');
        const page = Number(params.get('page'));
        return {
            report: REPORTS.some((r) => r.key === report) ? (report as ReportKey) : DEFAULTS.report,
            period: PERIOD_CHIPS.some((p) => p.value === period) ? (period as SalesPeriod) : DEFAULTS.period,
            from: params.get('from') ?? '',
            to: params.get('to') ?? '',
            staff: params.get('staff') ?? '',
            branch: params.get('branch') ?? '',
            method: params.get('method') ?? '',
            page: Number.isInteger(page) && page > 0 ? page : 0,
        };
    }, [params]);

    const update = useCallback(
        (patch: Partial<ReportFilters>) => {
            const next = { ...filters, ...patch };
            if (!('page' in patch)) next.page = 0; // any filter change goes back to page 1

            const sp = new URLSearchParams();
            (Object.keys(next) as (keyof ReportFilters)[]).forEach((k) => {
                if (next[k] !== DEFAULTS[k]) sp.set(k, String(next[k]));
            });
            setParams(sp, { replace: true });
        },
        [filters, setParams]
    );

    // Keep the chosen report, clear everything else
    const resetFilters = useCallback(() => {
        const sp = new URLSearchParams();
        if (filters.report !== DEFAULTS.report) sp.set('report', filters.report);
        setParams(sp, { replace: true });
    }, [filters.report, setParams]);

    const isCustom = Boolean(filters.from || filters.to);
    const isFiltered =
        isCustom ||
        filters.period !== DEFAULTS.period ||
        Boolean(filters.staff || filters.branch || filters.method);

    return { filters, update, resetFilters, isCustom, isFiltered };
}
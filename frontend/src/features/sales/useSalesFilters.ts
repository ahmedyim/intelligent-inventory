import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SalePaymentStatus, SalesPeriod, SaleStatus } from '@/types';

const PERIODS: SalesPeriod[] = ['today', 'yesterday', 'week', 'month', 'last_month', 'year', 'all'];

export interface SalesFilters {
  period: SalesPeriod;
  from: string;
  to: string;
  staff: string;
  branch: string;
  method: string;
  pay: '' | SalePaymentStatus;
  status: '' | SaleStatus;
  q: string;
  page: number;
}

const DEFAULTS: SalesFilters = {
  period: 'today',
  from: '',
  to: '',
  staff: '',
  branch: '',
  method: '',
  pay: '',
  status: '',
  q: '',
  page: 0,
};

export function useSalesFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<SalesFilters>(() => {
    const period = params.get('period');
    const pay = params.get('pay');
    const status = params.get('status');
    const page = Number(params.get('page'));
    return {
      period: PERIODS.includes(period as SalesPeriod) ? (period as SalesPeriod) : DEFAULTS.period,
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
      staff: params.get('staff') ?? '',
      branch: params.get('branch') ?? '',
      method: params.get('method') ?? '',
      pay: pay === 'PAID' || pay === 'PARTIAL' || pay === 'UNPAID' ? pay : '',
      status: status === 'COMPLETED' || status === 'VOIDED' ? status : '',
      q: params.get('q') ?? '',
      page: Number.isInteger(page) && page > 0 ? page : 0,
    };
  }, [params]);

  const update = useCallback(
    (patch: Partial<SalesFilters>) => {
      const next = { ...filters, ...patch };
      if (!('page' in patch)) next.page = 0; // any filter change goes back to page 1

      const sp = new URLSearchParams();
      (Object.keys(next) as (keyof SalesFilters)[]).forEach((k) => {
        if (next[k] !== DEFAULTS[k]) sp.set(k, String(next[k])); // defaults stay out of the URL
      });
      setParams(sp, { replace: true }); // filter clicks do not fill the Back history
    },
    [filters, setParams]
  );

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const isCustom = Boolean(filters.from || filters.to);
  const isFiltered =
    isCustom ||
    filters.period !== DEFAULTS.period ||
    Boolean(filters.staff || filters.branch || filters.method || filters.pay || filters.status || filters.q);

  return { filters, update, reset, isCustom, isFiltered };
}
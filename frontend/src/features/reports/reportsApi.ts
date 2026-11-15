import { baseApi } from '@/app/baseApi';
import type { BranchRevenue, ReportPeriod, SalesTrend, SummaryReport, TrendGranularity } from '@/types';

export interface SummaryQuery {
  period: ReportPeriod;
  branch_id?: string; // optional filter for the super admin
}

export interface TrendQuery {
  granularity: TrendGranularity;
  branch_id?: string;
}

export const reportsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSummary: build.query<SummaryReport, SummaryQuery>({
      query: (params) => ({ url: '/reports/summary', params }),
      providesTags: [{ type: 'Report', id: 'SUMMARY' }],
    }),
    getTrend: build.query<SalesTrend, TrendQuery>({
      query: (params) => ({ url: '/reports/trend', params }),
      providesTags: [{ type: 'Report', id: 'TREND' }],
    }),
    getRevenueByBranch: build.query<BranchRevenue[], { period: ReportPeriod }>({
      query: (params) => ({ url: '/reports/by-branch', params }),
      providesTags: [{ type: 'Report', id: 'BRANCH' }],
    }),
  }),
});

export const { useGetSummaryQuery, useGetTrendQuery, useGetRevenueByBranchQuery } = reportsApi;
import { baseApi } from '@/app/baseApi';
import type { ReportQuery, ReportTable } from '@/types';

export const reportTablesApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        getReportTable: build.query<ReportTable, ReportQuery>({
            query: ({ key, ...params }) => ({ url: `/reports/tables/${key}`, params }),
            providesTags: [{ type: 'Report', id: 'TABLE' }],
        }),
    }),
});

export const { useGetReportTableQuery } = reportTablesApi;
import { baseApi } from '@/app/baseApi';
import type { SaleDetail, SalesOverview, SalesQuery } from '@/types';

const listTag = { type: 'Sale' as const, id: 'LIST' };

export const salesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSalesOverview: build.query<SalesOverview, SalesQuery>({
      query: (params) => ({ url: '/sales/overview', params }),
      providesTags: [listTag],
    }),

    getSaleDetail: build.query<SaleDetail, string>({
      query: (id) => `/sales/${id}/detail`,
      providesTags: (_r, _e, id) => [{ type: 'Sale', id }],
    }),

    // Voiding returns stock and refunds money, so the sales list, dashboard and stock all change
    voidSale: build.mutation<unknown, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/sales/${id}/void`, method: 'POST', body: { reason: reason || null } }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Sale', id },
        listTag,
        { type: 'Report', id: 'SUMMARY' },
        { type: 'Report', id: 'TREND' },
        { type: 'Report', id: 'BRANCH' },
        { type: 'Stock', id: 'LIST' },
        { type: 'Product', id: 'LIST' },
      ],
    }),
  }),
});

export const { useGetSalesOverviewQuery, useGetSaleDetailQuery, useVoidSaleMutation } = salesApi;
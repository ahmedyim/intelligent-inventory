import { baseApi } from '@/app/baseApi';
import type { MySalesOverview, MySalesQuery, SaleReceipt } from '@/types';

export const sellerApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        getMySales: build.query<MySalesOverview, MySalesQuery>({
            query: (params) => ({ url: '/sales/mine', params }),
            providesTags: [{ type: 'Sale', id: 'LIST' }], // refreshes after every sale and refund
        }),

        getSaleReceipt: build.query<SaleReceipt, string>({
            query: (id) => `/sales/${id}/receipt`,
            providesTags: (_r, _e, id) => [{ type: 'Sale', id }],
        }),

        // Items go back to stock and money is refunded, so many screens change
        refundSale: build.mutation<SaleReceipt, { id: string; reason: string }>({
            query: ({ id, reason }) => ({ url: `/sales/${id}/refund`, method: 'POST', body: { reason } }),
            invalidatesTags: (_r, _e, { id }) => [
                { type: 'Sale', id },
                { type: 'Sale', id: 'LIST' },
                { type: 'Stock', id: 'LIST' },
                { type: 'Product', id: 'LIST' },
                { type: 'Report', id: 'SUMMARY' },
                { type: 'Report', id: 'TREND' },
                { type: 'Report', id: 'BRANCH' },
                { type: 'Report', id: 'TABLE' },
            ],
        }),
    }),
});

export const { useGetMySalesQuery, useGetSaleReceiptQuery, useRefundSaleMutation } = sellerApi;
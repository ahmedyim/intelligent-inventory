import { baseApi } from '@/app/baseApi';
import type { CreatedSale, Customer, PaymentMethod, PosStockList, SaleCreatePayload } from '@/types';

type MaybeList<T> = T[] | { items: T[] };
const asList = <T>(res: MaybeList<T>): T[] => (Array.isArray(res) ? res : (res?.items ?? []));

export interface PosStockQuery {
    branch_id: string;
    search?: string;
    low_stock?: boolean;
    skip?: number;
    limit?: number;
}

export const posApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        // Sellable products of ONE branch with stock and price. No cost.
        getPosStock: build.query<PosStockList, PosStockQuery>({
            query: ({ limit = 24, ...rest }) => ({ url: '/pos/products', params: { ...rest, limit } }),
            providesTags: [{ type: 'Stock', id: 'LIST' }],
        }),

        getPaymentMethods: build.query<PaymentMethod[], void>({
            query: () => '/payment-methods',
            transformResponse: (res: MaybeList<PaymentMethod>) => asList(res).filter((m) => m.is_active !== false),
        }),

        searchCustomers: build.query<Customer[], string>({
            query: (search) => ({ url: '/customers', params: { search, limit: 8 } }),
            transformResponse: (res: MaybeList<Customer>) => asList(res).filter((c) => c.is_active !== false),
        }),

        // A sale changes stock, the sales lists, the dashboard and every report
        createSale: build.mutation<CreatedSale, SaleCreatePayload>({
            query: (body) => ({ url: '/sales', method: 'POST', body }),
            invalidatesTags: [
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

export const {
    useGetPosStockQuery,
    useLazyGetPosStockQuery,
    useGetPaymentMethodsQuery,
    useSearchCustomersQuery,
    useCreateSaleMutation,
} = posApi;
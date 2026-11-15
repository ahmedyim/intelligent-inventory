import { baseApi } from '@/app/baseApi';
import type {
    ProductForecast,
    RunResult,
    Suggestion,
    SuggestionList,
    SuggestionProduct,
    SuggestionsQuery,
} from '@/types';

const listTag = { type: 'Forecast' as const, id: 'LIST' };

// What the API may really send. The product id is not guaranteed at the top level,
// so it is also read from the nested product.
type RawSuggestion = Omit<Suggestion, 'product_id' | 'branch_id'> & {
    product_id?: string | null;
    productId?: string | null;
    branch_id?: string | null;
    product?: SuggestionProduct | null;
};

interface RawSuggestionList extends Omit<SuggestionList, 'items'> {
    items: RawSuggestion[];
}

const normalize = (s: RawSuggestion, fallbackBranch: string): Suggestion => ({
    ...s,
    product_id: s.product_id ?? s.productId ?? s.product?.id ?? '',
    branch_id: s.branch_id ?? fallbackBranch,
});

export const forecastApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        getSuggestions: build.query<SuggestionList, SuggestionsQuery>({
            query: (params) => ({ url: '/forecast/suggestions', params }),
            transformResponse: (res: RawSuggestionList, _meta, arg): SuggestionList => ({
                ...res,
                items: res.items.map((s) => normalize(s, arg.branch_id)),
            }),
            providesTags: [listTag],
        }),

        runForecast: build.mutation<RunResult, { branch_id: string }>({
            query: (body) => ({ url: '/forecast/run', method: 'POST', body }),
            invalidatesTags: [listTag],
        }),

        approveSuggestion: build.mutation<Suggestion, { id: string; note?: string }>({
            query: ({ id, note }) => ({
                url: `/forecast/suggestions/${id}/approve`,
                method: 'POST',
                body: { note: note || null },
            }),
            invalidatesTags: [listTag],
        }),

        dismissSuggestion: build.mutation<Suggestion, { id: string; note?: string }>({
            query: ({ id, note }) => ({
                url: `/forecast/suggestions/${id}/dismiss`,
                method: 'POST',
                body: { note: note || null },
            }),
            invalidatesTags: [listTag],
        }),

        getProductForecast: build.query<ProductForecast, { product_id: string; branch_id: string; horizon: number }>({
            query: ({ product_id, ...params }) => ({ url: `/forecast/product/${product_id}`, params }),
        }),
    }),
});

export const {
    useGetSuggestionsQuery,
    useRunForecastMutation,
    useApproveSuggestionMutation,
    useDismissSuggestionMutation,
    useGetProductForecastQuery,
} = forecastApi;
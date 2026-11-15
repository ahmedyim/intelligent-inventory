import { baseApi } from '@/app/baseApi';
import type {
  PublicBranch,
  PublicCategory,
  PublicProductList,
  PublicProductsQuery,
  PublicStats,
} from '@/types';

export interface ContactInput {
  name: string;
  email: string;
  message: string;
}

export const publicApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    sendContact: build.mutation<void, ContactInput>({
      query: (body) => ({ url: '/public/contact', method: 'POST', body }),
    }),

    getPublicStats: build.query<PublicStats, void>({
      query: () => '/public/stats',
      keepUnusedDataFor: 300,
    }),

    getPublicBranches: build.query<PublicBranch[], void>({
      query: () => '/public/branches',
      keepUnusedDataFor: 300,
    }),

    getPublicCategories: build.query<PublicCategory[], void>({
      query: () => '/public/categories',
      keepUnusedDataFor: 300,
    }),

    getPublicProducts: build.query<PublicProductList, PublicProductsQuery>({
      query: (params) => ({ url: '/public/products', params }),
      keepUnusedDataFor: 60,
    }),
  }),
});

export const {
  useSendContactMutation,
  useGetPublicStatsQuery,
  useGetPublicBranchesQuery,
  useGetPublicCategoriesQuery,
  useGetPublicProductsQuery,
} = publicApi;
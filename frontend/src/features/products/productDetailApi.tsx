import { baseApi } from '@/app/baseApi';
import type { InventoryList, MovementList, MovementType, Product } from '@/types';

const INVENTORY_URL = '/inventory';
const MOVEMENTS_URL = '/inventory/movements';

export interface MovementsQuery {
  product_id: string;
  branch_id?: string;
  movement_type?: MovementType;
  skip?: number;
  limit?: number;
}

export const productDetailApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProductById: build.query<Product, string>({
      query: (id) => `/products/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Product', id }],
    }),

    // Stock rows of ONE product: one row per branch that has ever held it
    getProductInventory: build.query<InventoryList, string>({
      query: (product_id) => ({ url: INVENTORY_URL, params: { product_id, limit: 200 } }),
      providesTags: (_r, _e, id) => [{ type: 'Stock', id: `PRODUCT-${id}` }, { type: 'Stock', id: 'LIST' }],
    }),

    getProductMovements: build.query<MovementList, MovementsQuery>({
      query: (params) => ({ url: MOVEMENTS_URL, params }),
      providesTags: (_r, _e, { product_id }) => [
        { type: 'Stock', id: `MOVES-${product_id}` },
        { type: 'Stock', id: 'LIST' },
      ],
    }),
  }),
});

export const { useGetProductByIdQuery, useGetProductInventoryQuery, useGetProductMovementsQuery } =
  productDetailApi;
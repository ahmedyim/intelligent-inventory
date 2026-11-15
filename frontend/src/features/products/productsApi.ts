import { baseApi } from '@/app/baseApi';
import type { Product, ProductCreate, ProductList, ProductUpdate } from '@/types';

export type ProductStatusFilter = 'active' | 'inactive' | 'all';

export interface ProductsQuery {
  skip?: number;
  limit?: number;
  search?: string; // must be "search": that is the name the backend reads
  status?: ProductStatusFilter;
  category_id?: string;
  supplier_id?: string;
  low_stock?: boolean; // true = only products at or below their reorder level
  branch_id?: string; // stock figures and low_stock are for this branch only (branch admins)
}

const listTag = { type: 'Product' as const, id: 'LIST' };
const stockListTag = { type: 'Stock' as const, id: 'LIST' };
const summaryTag = { type: 'Report' as const, id: 'SUMMARY' };

export const productsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProducts: build.query<ProductList, ProductsQuery | void>({
      // undefined values are dropped from the URL automatically
      query: (params) => ({ url: '/products', params: params ?? undefined }),
      providesTags: (result) =>
        result
          ? [...result.items.map(({ id }) => ({ type: 'Product' as const, id })), listTag]
          : [listTag],
    }),

    createProduct: build.mutation<Product, ProductCreate>({
      query: (body) => ({ url: '/products', method: 'POST', body }),
      // opening stock changes the stock and the dashboard cards too
      invalidatesTags: [listTag, stockListTag, summaryTag],
    }),

    updateProduct: build.mutation<Product, { id: string; body: ProductUpdate }>({
      query: ({ id, body }) => ({ url: `/products/${id}`, method: 'PATCH', body }),
      // LIST is invalidated too: a price or name change can move a row between search results
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Product', id }, listTag, summaryTag],
    }),

    // Uses the dedicated endpoints, so the activity log says "activated" / "deactivated"
    setProductActive: build.mutation<Product, { id: string; active: boolean }>({
      query: ({ id, active }) => ({
        url: `/products/${id}/${active ? 'activate' : 'deactivate'}`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Product', id }, listTag, summaryTag],
    }),

    // Stock IN: also updates the product's weighted-average cost (and optionally the price),
    // so the product list must refresh too, not just the stock pages.
    receiveStock: build.mutation<unknown, StockReceiveBody>({
      query: (body) => ({ url: '/inventory/receive', method: 'POST', body }),
      invalidatesTags: (_r, _e, { product_id }) => [
        { type: 'Product', id: product_id },
        listTag,
        stockListTag,
        summaryTag,
      ],
    }),

    // Stock take: send the counted quantity, the backend records the difference.
    adjustStock: build.mutation<unknown, StockAdjustBody>({
      query: (body) => ({ url: '/inventory/adjust', method: 'POST', body }),
      invalidatesTags: (_r, _e, { product_id }) => [
        { type: 'Product', id: product_id },
        listTag,
        stockListTag,
        summaryTag,
      ],
    }),
  }),
});

export interface StockReceiveBody {
  product_id: string;
  branch_id: string;
  quantity: number;
  unit_cost: number;
  new_selling_price?: number | null;
  reason?: string;
  note?: string | null;
}

export interface StockAdjustBody {
  product_id: string;
  branch_id: string;
  counted_quantity: number;
  note?: string | null;
}

export const {
  useGetProductsQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useSetProductActiveMutation,
  useReceiveStockMutation,
  useAdjustStockMutation,
} = productsApi;
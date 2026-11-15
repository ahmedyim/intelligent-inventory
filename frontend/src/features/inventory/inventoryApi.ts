import { baseApi } from '@/app/baseApi';
import type {
  InventoryCreateBody,
  InventoryItem,
  InventoryList,
  InventoryQuery,
  LowStockItem,
  LowStockQuery,
  MovementList,
  MovementsQuery,
  StockAdjustBody,
  StockIssueBody,
  StockReceiveBody,
} from '@/types';

const stockListTag = { type: 'Stock' as const, id: 'LIST' };
const productListTag = { type: 'Product' as const, id: 'LIST' };
const summaryTag = { type: 'Report' as const, id: 'SUMMARY' };

// Every stock change also changes the product's total_stock (and, for receive, its cost / price),
// so the product list, the stock pages, the movements and the dashboard cards must all refresh.
const afterStockChange = (_r: unknown, _e: unknown, { product_id }: { product_id: string }) => [
  { type: 'Product' as const, id: product_id },
  productListTag,
  stockListTag,
  summaryTag,
];

export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ---------------- reads ----------------
    // GET /inventory
    getInventory: build.query<InventoryList, InventoryQuery | void>({
      query: (params) => ({ url: '/inventory', params: params ?? undefined }),
      providesTags: (result) =>
        result
          ? [...result.items.map(({ id }) => ({ type: 'Stock' as const, id })), stockListTag]
          : [stockListTag],
    }),

    // GET /inventory/{inventory_id}
    getInventoryItem: build.query<InventoryItem, string>({
      query: (id) => ({ url: `/inventory/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Stock', id }],
    }),

    // GET /inventory/low-stock
    getLowStock: build.query<LowStockItem[], LowStockQuery | void>({
      query: (params) => ({ url: '/inventory/low-stock', params: params ?? undefined }),
      providesTags: [stockListTag],
    }),

    // GET /inventory/movements
    // Uses the LIST tag, so every receive / issue / adjust refreshes this tab too
    getMovements: build.query<MovementList, MovementsQuery | void>({
      query: (params) => ({ url: '/inventory/movements', params: params ?? undefined }),
      providesTags: [stockListTag],
    }),

    // ---------------- stock operations ----------------
    // POST /inventory/receive: stock IN, updates the weighted-average cost (and optionally the price)
    receiveStock: build.mutation<unknown, StockReceiveBody>({
      query: (body) => ({ url: '/inventory/receive', method: 'POST', body }),
      invalidatesTags: afterStockChange,
    }),

    // POST /inventory/issue: stock OUT (damage, loss, sale...). 409 if there is not enough stock.
    issueStock: build.mutation<unknown, StockIssueBody>({
      query: (body) => ({ url: '/inventory/issue', method: 'POST', body }),
      invalidatesTags: afterStockChange,
    }),

    // POST /inventory/adjust: stock take. Send the counted quantity, the backend records the difference.
    adjustStock: build.mutation<unknown, StockAdjustBody>({
      query: (body) => ({ url: '/inventory/adjust', method: 'POST', body }),
      invalidatesTags: afterStockChange,
    }),

    // ---------------- inventory rows ----------------
    // POST /inventory: empty stock row (qty 0) for a product in a branch. Quantity stays 0,
    // so only the stock pages refresh, not the product totals.
    createInventory: build.mutation<InventoryItem, InventoryCreateBody>({
      query: (body) => ({ url: '/inventory', method: 'POST', body }),
      invalidatesTags: [stockListTag],
    }),

    // PATCH /inventory/{inventory_id}: settings only (per-branch reorder level).
    // Quantity never changes here. null = go back to the product's default level.
    updateInventory: build.mutation<InventoryItem, { id: string; reorder_level: number | null }>({
      query: ({ id, ...body }) => ({ url: `/inventory/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Stock', id }, stockListTag, productListTag],
    }),
  }),
});

export const {
  useGetInventoryQuery,
  useGetInventoryItemQuery,
  useGetLowStockQuery,
  useGetMovementsQuery,
  useReceiveStockMutation,
  useIssueStockMutation,
  useAdjustStockMutation,
  useCreateInventoryMutation,
  useUpdateInventoryMutation,
} = inventoryApi;
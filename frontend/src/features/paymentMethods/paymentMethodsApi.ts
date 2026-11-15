import { baseApi } from '@/app/baseApi';
export type PaymentMethodType = 'cash' | 'mobile_money' | 'bank';
export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  type: PaymentMethodType;
  account_number: string | null;
  account_name: string | null;
  requires_reference: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PaymentMethodCreate {
  code: string;
  name: string;
  type: PaymentMethodType;
  account_number: string | null;
  account_name: string | null;
  requires_reference: boolean;
  sort_order: number;
}
// code and type can never change after creation
export type PaymentMethodUpdate = Partial<
  Pick<PaymentMethod, 'name' | 'account_number' | 'account_name' | 'requires_reference' | 'is_active' | 'sort_order'>
>;

export const paymentMethodsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getPaymentMethods: build.query<PaymentMethod[], { includeInactive?: boolean } | void>({
      query: (args) => ({
        url: '/payment-methods', // TODO: match the prefix you mount the router with
        params: { include_inactive: args?.includeInactive ?? false },
      }),
      providesTags: (result) => [
        { type: 'PaymentMethod' as const, id: 'LIST' },
        ...(result ?? []).map((m) => ({ type: 'PaymentMethod' as const, id: m.id })),
      ],
    }),
    createPaymentMethod: build.mutation<PaymentMethod, PaymentMethodCreate>({
      query: (body) => ({ url: '/payment-methods', method: 'POST', body }),
      invalidatesTags: [{ type: 'PaymentMethod', id: 'LIST' }],
    }),
    updatePaymentMethod: build.mutation<PaymentMethod, { id: string; body: PaymentMethodUpdate }>({
      query: ({ id, body }) => ({ url: `/payment-methods/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'PaymentMethod', id },
        { type: 'PaymentMethod', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetPaymentMethodsQuery,
  useCreatePaymentMethodMutation,
  useUpdatePaymentMethodMutation,
} = paymentMethodsApi;
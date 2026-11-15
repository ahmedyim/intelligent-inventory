import { baseApi } from '@/app/baseApi'; // TODO: adjust if your baseApi file has another name/path

export type SellerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type Seller = {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'SELLER';
    status: SellerStatus;
    branch_id: string | null;
    created_at: string;
};

export type SellerList = { items: Seller[]; total: number };

type ListArgs = { search?: string; skip: number; limit: number };

const LIST_TAG = { type: 'User' as const, id: 'SELLERS' };

// baseApi already has baseUrl ".../api/v1", so paths start with "/users".
// Change "/users" if your main.py mounts the users router under another prefix.
export const sellersApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        // The backend locks a branch admin to their own branch, so no branch_id is sent.
        getBranchSellers: build.query<SellerList, ListArgs>({
            query: ({ search, skip, limit }) => ({
                url: '/users',
                params: { role: 'SELLER', skip, limit, ...(search ? { search } : {}) },
            }),
            providesTags: (result) =>
                result
                    ? [...result.items.map((s) => ({ type: 'User' as const, id: s.id })), LIST_TAG]
                    : [LIST_TAG],
        }),

        updateBranchSeller: build.mutation<
            Seller,
            { id: string; body: { full_name?: string; phone?: string } }
        >({
            query: ({ id, body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
            invalidatesTags: (_r, _e, { id }) => [{ type: 'User', id }],
        }),

        // Lock = SUSPENDED, Unlock = ACTIVE. The backend also signs the seller out of all devices.
        setBranchSellerStatus: build.mutation<
            Seller,
            { id: string; status: SellerStatus }
        >({
            query: ({ id, status }) => ({
                url: `/users/${id}/status`,
                method: 'PATCH',
                body: { status },
            }),
            invalidatesTags: (_r, _e, { id }) => [{ type: 'User', id }],
        }),
    }),
});

export const {
    useGetBranchSellersQuery,
    useUpdateBranchSellerMutation,
    useSetBranchSellerStatusMutation,
} = sellersApi;

// Turns an RTK Query / backend error into a readable message.
export function getErrorMessage(error: unknown): string {
    const e = error as {
        status?: number | string;
        data?: { detail?: unknown; message?: string };
        message?: string;
        error?: string;
    };
    if (e?.status === 'FETCH_ERROR') return 'Cannot reach the server. Check your connection.';
    const detail = e?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && (detail[0] as { msg?: string })?.msg) {
        return String((detail[0] as { msg: string }).msg);
    }
    return e?.data?.message ?? e?.message ?? e?.error ?? 'Something went wrong';
}
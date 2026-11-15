import { baseApi } from '@/app/baseApi';
import type { Branch, BranchCreate, BranchList, BranchRead, BranchUpdate } from '@/types';

// Turn on after the backend stores a status (see "Disable / Enable" below).
// Until then the page hides the Status column and the Disable button.
export const BRANCH_STATUS_ENABLED = false;

// A missing status means ACTIVE
const toBranch = ({ status, is_active, ...rest }: BranchRead): Branch => ({
  ...rest,
  status: status ?? (is_active === false ? 'INACTIVE' : 'ACTIVE'),
});

export const branchesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getBranches: build.query<Branch[], void>({
      query: () => '/branches',
      transformResponse: (res: BranchList) => res.items.map(toBranch),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Branch' as const, id })), { type: 'Branch', id: 'LIST' }]
          : [{ type: 'Branch', id: 'LIST' }],
    }),
    createBranch: build.mutation<Branch, BranchCreate>({
      query: (body) => ({ url: '/branches', method: 'POST', body }),
      transformResponse: (res: BranchRead) => toBranch(res),
      invalidatesTags: [{ type: 'Branch', id: 'LIST' }],
    }),
    updateBranch: build.mutation<Branch, { id: string } & BranchUpdate>({
      query: ({ id, ...body }) => ({ url: `/branches/${id}`, method: 'PATCH', body }),
      transformResponse: (res: BranchRead) => toBranch(res),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Branch', id }],
    }),
  }),
});

export const { useGetBranchesQuery, useCreateBranchMutation, useUpdateBranchMutation } = branchesApi;
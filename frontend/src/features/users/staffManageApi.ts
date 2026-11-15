import { baseApi } from '@/app/baseApi';

// Fields the backend accepts on PATCH /users/{id} (UserUpdate schema).
export type StaffEditBody = {
    full_name?: string;
    email?: string;
    phone?: string;
    role?: 'BRANCH_ADMIN' | 'SELLER';
    branch_id?: string;
    experience?: string;
    education_background?: string;
};

// Endpoint names are unique on purpose so they never clash with your existing usersApi.
// Both invalidate every 'User' tag, so the staff list, the detail page and the
// branch-admin sellers page all refresh by themselves.
export const staffManageApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        editStaffUser: build.mutation<unknown, { id: string; body: StaffEditBody }>({
            query: ({ id, body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
            invalidatesTags: ['User'],
        }),
        deleteStaffUser: build.mutation<unknown, string>({
            query: (id) => ({ url: `/users/${id}`, method: 'DELETE' }),
            invalidatesTags: ['User'],
        }),
    }),
});

export const { useEditStaffUserMutation, useDeleteStaffUserMutation } = staffManageApi;
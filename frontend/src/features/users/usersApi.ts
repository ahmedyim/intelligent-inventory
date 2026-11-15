import { baseApi } from '@/app/baseApi';
import type {
  MessageResponse,
  RevokeResult,
  StatusUpdate,
  UserCreate,
  UserDetail,
  UserListResponse,
  UserResponse,
  UserRole,
  UserSession,
  UserStatus,
} from '@/types';

export interface UsersQuery {
  role?: UserRole;
  status?: UserStatus;
  branch_id?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

const listTag = { type: 'User' as const, id: 'LIST' };
const sessionsTag = (id: string) => ({ type: 'User' as const, id: `SESSIONS-${id}` });

export const usersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getUsers: build.query<UserListResponse, UsersQuery | void>({
      query: (params) => ({ url: '/users', params: params ?? undefined }),
      providesTags: (result) =>
        result ? [...result.items.map(({ id }) => ({ type: 'User' as const, id })), listTag] : [listTag],
    }),

    getUser: build.query<UserDetail, string>({
      query: (id) => `/users/${id}/detail`,
      providesTags: (_r, _e, id) => [{ type: 'User', id }],
    }),

    createUser: build.mutation<UserResponse, UserCreate>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: [listTag],
    }),

    updateUserStatus: build.mutation<UserResponse, { id: string } & StatusUpdate>({
      query: ({ id, ...body }) => ({ url: `/users/${id}/status`, method: 'PATCH', body }),
      // leaving ACTIVE also signs the user out everywhere, so refresh the sessions too
      invalidatesTags: (_r, _e, { id }) => [{ type: 'User', id }, sessionsTag(id)],
    }),

    resetUserPassword: build.mutation<MessageResponse, { id: string; new_password: string }>({
      query: ({ id, ...body }) => ({ url: `/users/${id}/reset-password`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'User', id }, sessionsTag(id)],
    }),

    getUserSessions: build.query<UserSession[], string>({
      query: (id) => `/users/${id}/sessions`,
      providesTags: (_r, _e, id) => [sessionsTag(id)],
    }),

    revokeUserSession: build.mutation<MessageResponse, { userId: string; sessionId: string }>({
      query: ({ userId, sessionId }) => ({ url: `/users/${userId}/sessions/${sessionId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { userId }) => [sessionsTag(userId), { type: 'User', id: userId }],
    }),

    revokeAllUserSessions: build.mutation<RevokeResult, string>({
      query: (userId) => ({ url: `/users/${userId}/sessions/revoke-all`, method: 'POST' }),
      invalidatesTags: (_r, _e, userId) => [sessionsTag(userId), { type: 'User', id: userId }],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetUserQuery,
  useCreateUserMutation,
  useUpdateUserStatusMutation,
  useResetUserPasswordMutation,
  useGetUserSessionsQuery,
  useRevokeUserSessionMutation,
  useRevokeAllUserSessionsMutation,
} = usersApi;
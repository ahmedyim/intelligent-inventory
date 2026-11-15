import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { RootState } from './store';
import { logout, setCredentials } from '@/features/auth/authSlice';
import { refreshSession } from '@/features/auth/session';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    headers.set('X-Requested-With', 'XMLHttpRequest'); // CSRF guard, checked by the backend
    const token = (getState() as RootState).auth.token;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  const getAuth = () => (api.getState() as RootState).auth;
  const tokenSent = getAuth().token;

  let result = await rawBaseQuery(args, api, extra);

  const url = typeof args === 'string' ? args : args.url;
  const isAuthCall = url.startsWith('/auth/');

  // A 401 while signed in (or while the session is still loading): get a fresh token once
  if (result.error?.status === 401 && !isAuthCall && getAuth().status !== 'anonymous') {
    // Skip the refresh if another request already replaced the token meanwhile
    if (getAuth().token === tokenSent) {
      try {
        const session = await refreshSession();
        if (!session) {
          api.dispatch(logout());
          api.dispatch(baseApi.util.resetApiState());
          return result;
        }
        api.dispatch(setCredentials({ user: session.user, token: session.access_token }));
      } catch {
        return result; // network problem: keep the session and let the page show the error
      }
    }
    result = await rawBaseQuery(args, api, extra); // retry once with the new token
  }
  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Branch', 'User', 'Product', 'Stock', 'Report', 'Sale', 'Forecast', 'PaymentMethod'],
  endpoints: () => ({}),
});
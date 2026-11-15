import { createAction, createSlice } from '@reduxjs/toolkit';
import type { SessionUser } from '@/types';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  user: SessionUser | null;
  token: string | null; 
  status: AuthStatus;
}

const initialState: AuthState = { user: null, token: null, status: 'loading' };

// Explicit action creators
export const setCredentials = createAction<{ user: SessionUser; token: string }>('auth/setCredentials');
export const logout = createAction('auth/logout');

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(setCredentials, (state, action) => {
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.status = 'authenticated';
      })
      .addCase(logout, (state) => {
        state.user = null;
        state.token = null;
        state.status = 'anonymous';
      });
  },
});

export default authSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors. They return plain values, so components only re-render when the
// value they read really changes.
// ---------------------------------------------------------------------------
type WithAuth = { auth: AuthState };

export const selectUser = (s: WithAuth) => s.auth.user;
export const selectToken = (s: WithAuth) => s.auth.token;
export const selectAuthStatus = (s: WithAuth) => s.auth.status;
export const selectRole = (s: WithAuth) => s.auth.user?.role;
export const selectBranchId = (s: WithAuth) => s.auth.user?.branch_id ?? null;
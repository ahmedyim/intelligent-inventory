import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from './baseApi';
import authReducer from '@/features/auth/authSlice';

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    auth: authReducer,
  },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  devTools: import.meta.env.DEV, // the token would be visible in Redux DevTools, so dev only
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
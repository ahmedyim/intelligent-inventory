import { useEffect, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import { baseApi } from './baseApi';
import { useAppDispatch } from './hooks';
import { Toaster } from '@/components/ui/sonner';
import { logout, setCredentials } from '@/features/auth/authSlice';
import { onRemoteLogout, refreshSession } from '@/features/auth/session';

function SessionBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    localStorage.removeItem('auth'); // delete the token the old version stored

    let alive = true;
    refreshSession()
      .then((session) => {
        if (!alive) return;
        dispatch(session ? setCredentials({ user: session.user, token: session.access_token }) : logout());
      })
      .catch(() => alive && dispatch(logout()));

    const stopListening = onRemoteLogout(() => {
      dispatch(logout());
      dispatch(baseApi.util.resetApiState());
    });

    return () => {
      alive = false;
      stopListening();
    };
  }, [dispatch]);

  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <SessionBootstrap />
      {children}
      <Toaster richColors />
    </Provider>
  );
}
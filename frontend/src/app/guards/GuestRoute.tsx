import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import SplashScreen from '@/components/SplashScreen';
import { ROLE_HOME } from '@/lib/roles';

// For pages only signed-out visitors should see (login, forgot password).
// A signed-in user is sent straight to their own dashboard.
export default function GuestRoute() {
  const { user, token, status } = useAppSelector((s) => s.auth);

  if (status === 'loading') return <SplashScreen />; // wait for the refresh call to finish
  if (user && token) return <Navigate to={ROLE_HOME[user.role] ?? '/'} replace />;
  return <Outlet />;
}
import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import SplashScreen from '@/components/SplashScreen';
import type { UserRole } from '@/types';

export default function RoleRoute({ allow }: { allow: UserRole[] }) {
  const { user, token, status } = useAppSelector((s) => s.auth);

  if (status === 'loading') return <SplashScreen />; // session is still being restored
  if (!user || !token) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}
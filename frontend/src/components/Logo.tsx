import { Link } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { useAppSelector } from '@/app/hooks';

interface Props {
  className?: string;
  light?: boolean;
}

// Replace the keys with your real roles and the values with your real routes
const DASHBOARD_BY_ROLE: Record<string, string> = {
  super_admin: '/super-admin',
  admin: '/admin',
  manager: '/manager',
  cashier: '/cashier',
  seller: '/seller',
};

export default function Logo({ className, light }: Props) {
  const [first, second] = BRAND.name.split(' ');
  const user = useAppSelector((s) => s.auth.user);
  const status = useAppSelector((s) => s.auth.status);

  // Not logged in -> "/" (public page). Logged in -> dashboard for their role.
  const to =
    status === 'authenticated' && user
      ? DASHBOARD_BY_ROLE[user.role] ?? '/'
      : '/';

  return (
    <Link to={to} className={cn('flex items-center gap-2', className)}>
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm">
        <Boxes className="h-5 w-5" />
      </span>
      <span className={cn('text-lg font-bold tracking-tight', light ? 'text-white' : 'text-zinc-900')}>
        {first}
        <span className="text-orange-500"> {second}</span>
      </span>
    </Link>
  );
}
import { ROLE_LABEL } from '@/lib/roles';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';

const TONES: Record<UserRole, string> = {
  SUPER_ADMIN: 'bg-violet-100 text-violet-700',
  BRANCH_ADMIN: 'bg-orange-100 text-orange-700',
  SELLER: 'bg-sky-100 text-sky-700',
};

export default function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', TONES[role])}>
      {ROLE_LABEL[role]}
    </span>
  );
}
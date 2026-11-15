import type { UserRole } from '@/types';

export const ROLE_HOME: Record<UserRole, string> = {
  SUPER_ADMIN: '/super-admin',
  BRANCH_ADMIN: '/branch-admin',
  SELLER: '/seller',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  BRANCH_ADMIN: 'Branch Admin',
  SELLER: 'Seller',
};
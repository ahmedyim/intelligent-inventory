import { useAppSelector } from '@/app/hooks';
import { selectBranchId, selectRole } from '@/features/auth/authSlice';

/**
 * Which branch the signed-in user is allowed to work in.
 *  - super admin:        any branch (lockedBranchId is undefined)
 *  - branch admin/seller: only their own (lockedBranchId is their branch)
 * The backend enforces the same rule; this only keeps the browser's requests in line.
 */
export function useBranchScope() {
    const role = useAppSelector(selectRole);
    const branchId = useAppSelector(selectBranchId);

    const isSuperAdmin = role === 'SUPER_ADMIN';
    const lockedBranchId = !isSuperAdmin && branchId ? branchId : undefined;
    // Signed in, not a super admin, but no branch on the account: the API will answer 403
    const missingBranch = role !== undefined && !isSuperAdmin && !branchId;

    return { role, branchId, isSuperAdmin, lockedBranchId, missingBranch };
}
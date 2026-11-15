import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ConfirmDialog from '@/components/ConfirmDialog';
import RoleBadge from '@/components/RoleBadge';
import StatusBadge from '@/components/StatusBadge';
import { useAppSelector } from '@/app/hooks';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import ResetPasswordDialog from '@/features/users/ResetPasswordDialog';
import StaffEditDialog from '@/features/users/StaffEditDialog';
import { useDeleteStaffUserMutation } from '@/features/users/staffManageApi';
import {
  useGetUserQuery,
  useGetUserSessionsQuery,
  useRevokeAllUserSessionsMutation,
  useRevokeUserSessionMutation,
  useUpdateUserStatusMutation,
} from '@/features/users/usersApi';
import { describeAgent } from '@/lib/device';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime, initialsOf, parseApiDate, timeAgo } from '@/lib/format';
import type { UserSession, UserStatus } from '@/types';

type Confirm =
  | { kind: 'all' }
  | { kind: 'one'; session: UserSession }
  | { kind: 'status'; status: UserStatus }
  | { kind: 'delete' };

const STATUS_COPY: Record<UserStatus, { title: string; body: string; label: string }> = {
  SUSPENDED: {
    title: 'Suspend this account?',
    body: 'They are signed out of every device and cannot log in until you activate the account again.',
    label: 'Suspend',
  },
  INACTIVE: {
    title: 'Deactivate this account?',
    body: 'Use this when someone leaves. They are signed out everywhere and cannot log in. Their history is kept.',
    label: 'Deactivate',
  },
  ACTIVE: {
    title: 'Activate this account?',
    body: 'They will be able to log in again.',
    label: 'Activate',
  },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  );
}

export default function StaffDetail() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const me = useAppSelector((s) => s.auth.user);

  const { data: user, isLoading, isError } = useGetUserQuery(userId, { skip: !userId });
  const {
    data: sessions = [],
    isLoading: loadingSessions,
    isError: sessionsError,
    refetch: refetchSessions,
  } = useGetUserSessionsQuery(userId, { skip: !userId });
  const { data: branches = [] } = useGetBranchesQuery();

  const [revokeAll] = useRevokeAllUserSessionsMutation();
  const [revokeOne] = useRevokeUserSessionMutation();
  const [updateStatus] = useUpdateUserStatusMutation();
  const [deleteStaff] = useDeleteStaffUserMutation();

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="rounded-md border bg-white p-8 text-center">
        <p className="mb-3 text-sm text-muted-foreground">This staff member was not found.</p>
        <Button asChild variant="outline">
          <Link to="/super-admin/staff">Back to staff</Link>
        </Button>
      </div>
    );
  }

  const isSelf = me?.id === user.id;
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const canManage = !isSelf && !isSuperAdmin;
  const branchLabel = branches.find((b) => b.id === user.branch_id)?.name;

  const copy = !confirm
    ? null
    : confirm.kind === 'all'
      ? {
        title: 'Sign out everywhere?',
        body: `${user.full_name} will be signed out of ${sessions.length} ${sessions.length === 1 ? 'device' : 'devices'} and must log in again. If you think the account is compromised, also reset the password.`,
        label: 'Sign out everywhere',
        destructive: true,
      }
      : confirm.kind === 'one'
        ? {
          title: 'Sign out this device?',
          body: `${confirm.session.device_name ?? describeAgent(confirm.session.user_agent)} will be signed out. Other devices stay signed in.`,
          label: 'Sign out device',
          destructive: true,
        }
        : confirm.kind === 'delete'
          ? {
            title: 'Delete this staff member?',
            body: `${user.full_name} will be removed permanently. This cannot be undone. If they already have sales or other records, the system will refuse to delete them, so deactivate the account instead.`,
            label: 'Delete permanently',
            destructive: true,
          }
          : {
            ...STATUS_COPY[confirm.status],
            destructive: confirm.status !== 'ACTIVE',
          };

  const onConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'all') {
        const res = await revokeAll(user.id).unwrap();
        toast.success(`Signed out of ${res.revoked} ${res.revoked === 1 ? 'device' : 'devices'}`);
      } else if (confirm.kind === 'one') {
        await revokeOne({ userId: user.id, sessionId: confirm.session.id }).unwrap();
        toast.success('Device signed out');
      } else if (confirm.kind === 'delete') {
        await deleteStaff(user.id).unwrap();
        toast.success('Staff member deleted');
        navigate('/super-admin/staff', { replace: true });
      } else {
        await updateStatus({ id: user.id, status: confirm.status }).unwrap();
        toast.success('Account updated');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Something went wrong'));
      throw err; // keeps the dialog open
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to="/super-admin/staff"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-orange-600"
      >
        <ArrowLeft className="h-4 w-4" /> All staff
      </Link>

      {/* Header */}
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-lg font-semibold text-white">
              {initialsOf(user.full_name)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{user.full_name}</h1>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RoleBadge role={user.role} />
                <StatusBadge status={user.status} />
                {branchLabel && <span className="text-xs text-muted-foreground">{branchLabel}</span>}
              </div>
            </div>
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
              <Button variant="outline" onClick={() => setResetOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" /> Reset password
              </Button>
              {user.status === 'ACTIVE' && (
                <Button variant="outline" onClick={() => setConfirm({ kind: 'status', status: 'SUSPENDED' })}>
                  <Ban className="mr-2 h-4 w-4" /> Suspend
                </Button>
              )}
              {user.status !== 'ACTIVE' && (
                <Button variant="outline" onClick={() => setConfirm({ kind: 'status', status: 'ACTIVE' })}>
                  <UserCheck className="mr-2 h-4 w-4" /> Activate
                </Button>
              )}
              {user.status !== 'INACTIVE' && (
                <Button variant="outline" onClick={() => setConfirm({ kind: 'status', status: 'INACTIVE' })}>
                  <UserX className="mr-2 h-4 w-4" /> Deactivate
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setConfirm({ kind: 'delete' })}
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </div>
          )}
        </div>

        {!canManage && (
          <p className="border-t bg-zinc-50 px-5 py-3 text-sm text-muted-foreground">
            {isSelf
              ? 'This is your own account. Use the account menu to log out of your devices.'
              : 'Super admin accounts are protected and cannot be changed here.'}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Profile */}
        <Card className="gap-0 py-0 lg:col-span-1">
          <div className="p-4 pb-0">
            <h2 className="text-base font-semibold">Profile</h2>
          </div>
          <dl className="divide-y px-4 pb-2">
            <Row label="Email">{user.email}</Row>
            <Row label="Phone">{user.phone || '-'}</Row>
            <Row label="Branch">{branchLabel ?? 'Not assigned'}</Row>
            <Row label="Last active">{timeAgo(user.last_active_at)}</Row>
            <Row label="Added">{parseApiDate(user.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}</Row>
            <Row label="Experience">{user.experience || '-'}</Row>
            <Row label="Education">{user.education_background || '-'}</Row>
          </dl>
        </Card>

        {/* Sessions */}
        <Card className="gap-0 py-0 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h2 className="text-base font-semibold">Signed-in devices</h2>
              <p className="text-sm text-muted-foreground">
                {sessions.length === 0
                  ? 'Not signed in anywhere.'
                  : `${sessions.length} active ${sessions.length === 1 ? 'device' : 'devices'}`}
              </p>
            </div>
            {canManage && (
              <Button
                variant="outline"
                disabled={sessions.length === 0}
                onClick={() => setConfirm({ kind: 'all' })}
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="mr-2 h-4 w-4" /> Sign out everywhere
              </Button>
            )}
          </div>

          {sessionsError ? (
            <div className="p-6 pt-2 text-center">
              <p className="mb-3 text-sm text-muted-foreground">Could not load the devices.</p>
              <Button variant="outline" size="sm" onClick={() => refetchSessions()}>
                Try again
              </Button>
            </div>
          ) : loadingSessions ? (
            <div className="space-y-2 p-4 pt-0">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="grid place-items-center gap-2 px-4 pb-8 pt-4 text-sm text-muted-foreground">
              <MonitorSmartphone className="h-8 w-8 text-zinc-300" aria-hidden />
              No active devices.
            </div>
          ) : (
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>IP address</TableHead>
                    <TableHead>Last active</TableHead>
                    {canManage && <TableHead className="w-28" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="font-medium">{s.device_name ?? describeAgent(s.user_agent)}</p>
                        {s.device_name && (
                          <p className="text-xs text-muted-foreground">{describeAgent(s.user_agent)}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{s.ip_address ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm" title={formatDateTime(s.last_used_at)}>
                        {timeAgo(s.last_used_at)}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: 'one', session: s })}>
                            Sign out
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={copy?.title ?? ''}
        description={copy?.body ?? ''}
        confirmLabel={copy?.label ?? 'Confirm'}
        destructive={copy?.destructive}
        onConfirm={onConfirm}
      />

      <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} userId={user.id} userName={user.full_name} />

      <StaffEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        user={user}
        branches={branches.filter((b) => b.status === 'ACTIVE' || b.id === user.branch_id)}
      />
    </div>
  );
}
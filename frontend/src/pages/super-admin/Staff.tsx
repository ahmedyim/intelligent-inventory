import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from '@/components/PageHeader';
import RoleBadge from '@/components/RoleBadge';
import StatusBadge from '@/components/StatusBadge';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import StaffFormDialog from '@/features/users/StaffFormDialog';
import { useGetUsersQuery } from '@/features/users/usersApi';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { initialsOf, parseApiDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { UserRole, UserStatus } from '@/types';

const PAGE_SIZE = 20;

const ROLE_TABS: { value: 'all' | UserRole; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'BRANCH_ADMIN', label: 'Branch admins' },
  { value: 'SELLER', label: 'Sellers' },
];

const isRole = (v: string | null): v is UserRole =>
  v === 'SUPER_ADMIN' || v === 'BRANCH_ADMIN' || v === 'SELLER';

export default function Staff() {
  const [params] = useSearchParams();
  const [role, setRole] = useState<'all' | UserRole>(() => {
    const r = params.get('role');
    return isRole(r) ? r : 'all';
  });
  const [status, setStatus] = useState<'all' | UserStatus>('all');
  const [branch, setBranch] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);
  const query = debouncedSearch.trim();

  // Back to page 1 when the search that is actually SENT changes
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setPage(0);
  }

  const { data: branches = [] } = useGetBranchesQuery();
  const { data, isLoading, isFetching, isError, refetch } = useGetUsersQuery({
    role: role === 'all' ? undefined : role,
    status: status === 'all' ? undefined : status,
    branch_id: branch === 'all' ? undefined : branch,
    search: query || undefined,
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const hasFilters = role !== 'all' || status !== 'all' || branch !== 'all' || query !== '';

  const changeRole = (v: 'all' | UserRole) => {
    setRole(v);
    setPage(0);
  };

  const clearFilters = () => {
    setRole('all');
    setStatus('all');
    setBranch('all');
    setSearch('');
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff"
        description="Everyone who can sign in. Open a person to see their devices and sign them out."
        action={
          <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add staff
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            aria-label="Search staff"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div role="group" aria-label="Filter by role" className="inline-flex rounded-lg border bg-white p-1">
          {ROLE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={role === t.value}
              onClick={() => changeRole(t.value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                role === t.value ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-orange-50'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as 'all' | UserStatus);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={branch}
          onValueChange={(v) => {
            setBranch(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filter by branch">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          {isError ? (
            <div className="p-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground">Could not load staff.</p>
              <Button variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                {page > 0
                  ? 'There is nobody on this page.'
                  : hasFilters
                    ? 'No staff match these filters.'
                    : 'No staff yet. Add your first staff member.'}
              </p>
              {page > 0 ? (
                <Button variant="outline" onClick={() => setPage(0)}>
                  Go to page 1
                </Button>
              ) : (
                hasFilters && (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )
              )}
            </div>
          ) : (
            <div className={cn('overflow-x-auto', isFetching && 'opacity-60')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <Link to={`/super-admin/staff/${u.id}`} className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-100 text-sm font-semibold text-orange-700">
                            {initialsOf(u.full_name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium hover:text-orange-600">{u.full_name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={u.role} />
                      </TableCell>
                      <TableCell>{u.branch_id ? (branchName.get(u.branch_id) ?? '-') : '-'}</TableCell>
                      <TableCell>
                        <StatusBadge status={u.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {parseApiDate(u.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/super-admin/staff/${u.id}`}>Manage</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {from}-{to} of {total}
          </p>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {pageCount}
              </span>
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      <StaffFormDialog
        open={creating}
        onOpenChange={setCreating}
        branches={branches.filter((b) => b.status === 'ACTIVE')}
      />
    </div>
  );
}
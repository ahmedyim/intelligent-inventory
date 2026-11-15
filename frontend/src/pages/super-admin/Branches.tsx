import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import BranchFormDialog from '@/features/branches/BranchFormDialog';
import {
  BRANCH_STATUS_ENABLED,
  useGetBranchesQuery,
  useUpdateBranchMutation,
} from '@/features/branches/branchesApi';
import { getErrorMessage } from '@/lib/errors';
import type { Branch } from '@/types';

export default function Branches() {
  const [dialog, setDialog] = useState<{ open: boolean; branch?: Branch }>({ open: false });

  const { data = [], isLoading, isError, refetch } = useGetBranchesQuery();
  const [updateBranch] = useUpdateBranchMutation();

  const toggleStatus = async (b: Branch) => {
    try {
      await updateBranch({ id: b.id, status: b.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }).unwrap();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the branch'));
    }
  };

  const columns: ColumnDef<Branch>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'location', header: 'Location' },
    { accessorKey: 'email', header: 'Email', cell: ({ row }) => row.original.email || '-' },
    { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone || '-' },
    ...(BRANCH_STATUS_ENABLED
      ? [
          {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <StatusBadge status={row.original.status} />,
          } satisfies ColumnDef<Branch>,
        ]
      : []),
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialog({ open: true, branch: row.original })}>
            Edit
          </Button>
          {BRANCH_STATUS_ENABLED && (
            <Button variant="outline" size="sm" onClick={() => toggleStatus(row.original)}>
              {row.original.status === 'ACTIVE' ? 'Disable' : 'Enable'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        description="Create and manage all company branches."
        action={
          <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => setDialog({ open: true })}>
            <Plus className="mr-2 h-4 w-4" /> Add branch
          </Button>
        }
      />

      {isError ? (
        <div className="rounded-md border p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">Could not load branches.</p>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <DataTable columns={columns} data={data} isLoading={isLoading} />
      )}

      <BranchFormDialog
        open={dialog.open}
        branch={dialog.branch}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </div>
  );
}
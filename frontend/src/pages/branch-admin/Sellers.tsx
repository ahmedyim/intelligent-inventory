import { useEffect, useState } from 'react';
import { Lock, LockOpen, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    getErrorMessage,
    useGetBranchSellersQuery,
    useSetBranchSellerStatusMutation,
    useUpdateBranchSellerMutation,
    type Seller,
} from '@/features/users/Sellersapi';

const PAGE_SIZE = 10;

export default function BranchSellers() {
    const [page, setPage] = useState(0);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');

    // Edit dialog
    const [editing, setEditing] = useState<Seller | null>(null);
    const [form, setForm] = useState({ full_name: '', phone: '' });
    const [formError, setFormError] = useState<string | null>(null);

    // Lock / unlock dialog
    const [lockTarget, setLockTarget] = useState<Seller | null>(null);
    const [lockError, setLockError] = useState<string | null>(null);

    // Wait 300ms after typing before searching, and go back to page 1.
    useEffect(() => {
        const t = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(0);
        }, 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const { data, isFetching, error, refetch } = useGetBranchSellersQuery({
        search: search || undefined,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
    });
    const [updateSeller, { isLoading: updating }] = useUpdateBranchSellerMutation();
    const [setStatus, { isLoading: changingStatus }] = useSetBranchSellerStatusMutation();
    const saving = updating || changingStatus;

    const sellers = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const openEdit = (seller: Seller) => {
        setEditing(seller);
        setForm({ full_name: seller.full_name, phone: seller.phone ?? '' });
        setFormError(null);
    };

    const saveEdit = async () => {
        if (!editing) return;
        setFormError(null);
        try {
            // Send only what changed.
            const body: { full_name?: string; phone?: string } = {};
            if (form.full_name.trim() !== editing.full_name) body.full_name = form.full_name.trim();
            if (form.phone.trim() !== (editing.phone ?? '')) body.phone = form.phone.trim();

            if (Object.keys(body).length > 0) {
                await updateSeller({ id: editing.id, body }).unwrap();
            }
            setEditing(null); // the list refreshes by itself (tag invalidation)
        } catch (err) {
            setFormError(getErrorMessage(err));
        }
    };

    const confirmToggleLock = async () => {
        if (!lockTarget) return;
        setLockError(null);
        try {
            const next = lockTarget.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
            await setStatus({ id: lockTarget.id, status: next }).unwrap();
            setLockTarget(null);
        } catch (err) {
            setLockError(getErrorMessage(err));
        }
    };

    const statusBadge = (status: Seller['status']) => {
        if (status === 'SUSPENDED') return <Badge variant="destructive">Locked</Badge>;
        if (status === 'INACTIVE') return <Badge variant="outline">Inactive</Badge>;
        return <Badge variant="secondary">Active</Badge>;
    };

    return (
        <div className="space-y-4 p-4">
            <div>
                <h1 className="text-2xl font-semibold">Sellers</h1>
                <p className="text-sm text-muted-foreground">
                    Manage the sellers of your branch. New sellers are added by the super admin.
                </p>
            </div>

            <Input
                placeholder="Search by name or email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="max-w-sm"
            />

            {error && (
                <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <span>{getErrorMessage(error)}</span>
                    <Button size="sm" variant="outline" onClick={() => refetch()}>
                        Retry
                    </Button>
                </div>
            )}

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isFetching && sellers.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                                Loading sellers...
                            </TableCell>
                        </TableRow>
                    ) : sellers.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                                No sellers found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        sellers.map((seller) => (
                            <TableRow key={seller.id}>
                                <TableCell className="font-medium">{seller.full_name}</TableCell>
                                <TableCell>{seller.email}</TableCell>
                                <TableCell>{seller.phone ?? '-'}</TableCell>
                                <TableCell>{statusBadge(seller.status)}</TableCell>
                                <TableCell className="space-x-2 text-right">
                                    <Button size="sm" variant="outline" onClick={() => openEdit(seller)}>
                                        <Pencil className="mr-1 h-4 w-4" />
                                        Edit
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={seller.status === 'SUSPENDED' ? 'default' : 'outline'}
                                        disabled={seller.status === 'INACTIVE'}
                                        title={
                                            seller.status === 'INACTIVE'
                                                ? 'Deactivated by the super admin'
                                                : undefined
                                        }
                                        onClick={() => {
                                            setLockError(null);
                                            setLockTarget(seller);
                                        }}
                                    >
                                        {seller.status === 'SUSPENDED' ? (
                                            <>
                                                <LockOpen className="mr-1 h-4 w-4" />
                                                Unlock
                                            </>
                                        ) : (
                                            <>
                                                <Lock className="mr-1 h-4 w-4" />
                                                Lock
                                            </>
                                        )}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                    {total} seller{total === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={page === 0 || isFetching}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        Previous
                    </Button>
                    <span>
                        Page {page + 1} of {totalPages}
                    </span>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={page + 1 >= totalPages || isFetching}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </Button>
                </div>
            </div>

            {/* Edit seller */}
            <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit seller</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="full_name">Full name</Label>
                            <Input
                                id="full_name"
                                value={form.full_name}
                                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">3 to 50 characters.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Phone</Label>
                            <Input
                                id="phone"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email (cannot be changed)</Label>
                            <Input id="email" value={editing?.email ?? ''} disabled />
                        </div>
                        {formError && <p className="text-sm text-red-600">{formError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            onClick={saveEdit}
                            disabled={saving || form.full_name.trim().length < 3}
                        >
                            {saving ? 'Saving...' : 'Save changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Lock / unlock confirmation */}
            <AlertDialog
                open={!!lockTarget}
                onOpenChange={(open) => !open && setLockTarget(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {lockTarget?.status === 'SUSPENDED' ? 'Unlock seller?' : 'Lock seller?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {lockTarget?.status === 'SUSPENDED'
                                ? `${lockTarget?.full_name} will be able to sign in and sell again.`
                                : `${lockTarget?.full_name} will be signed out of all devices and cannot sign in until you unlock the account.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {lockError && <p className="text-sm text-red-600">{lockError}</p>}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
                        {/* Plain Button so the dialog stays open if the request fails */}
                        <Button onClick={confirmToggleLock} disabled={saving}>
                            {saving
                                ? 'Please wait...'
                                : lockTarget?.status === 'SUSPENDED'
                                    ? 'Unlock'
                                    : 'Lock'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
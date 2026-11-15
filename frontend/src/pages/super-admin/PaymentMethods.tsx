import { useMemo, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCreatePaymentMethodMutation,
  useGetPaymentMethodsQuery,
  useUpdatePaymentMethodMutation,
  type PaymentMethod,
  type PaymentMethodType,
} from '@/features/paymentMethods/paymentMethodsApi';
import { cn } from '@/lib/utils';

type StatusFilter = 'active' | 'inactive' | 'all';

const CODE_RE = /^[a-z0-9_]{2,20}$/;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
];

const TYPE_LABEL: Record<PaymentMethodType, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile money',
  bank: 'Bank',
};

interface FormState {
  code: string;
  name: string;
  type: PaymentMethodType;
  account_number: string;
  account_name: string;
  requires_reference: boolean;
  sort_order: string;
}

const emptyForm: FormState = {
  code: '',
  name: '',
  type: 'bank',
  account_number: '',
  account_name: '',
  requires_reference: true,
  sort_order: '0',
};

const toForm = (m: PaymentMethod): FormState => ({
  code: m.code,
  name: m.name,
  type: m.type,
  account_number: m.account_number ?? '',
  account_name: m.account_name ?? '',
  requires_reference: m.requires_reference,
  sort_order: String(m.sort_order),
});

const errorMessage = (err: unknown) => {
  const detail = (err as { data?: { detail?: unknown } })?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return 'Something went wrong. Please try again.';
};

export default function PaymentMethods() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  // The list is small, so load everything once and filter in the browser
  const { data, isLoading, isFetching, isError, refetch } = useGetPaymentMethodsQuery({
    includeInactive: true,
  });
  const [createMethod, { isLoading: creating }] = useCreatePaymentMethodMutation();
  const [updateMethod, { isLoading: updating }] = useUpdatePaymentMethodMutation();
  const saving = creating || updating;

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((m) => {
      if (status === 'active' && !m.is_active) return false;
      if (status === 'inactive' && m.is_active) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        (m.account_number ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, search, status]);

  const total = data?.length ?? 0;
  const codeInvalid = !editing && form.code !== '' && !CODE_RE.test(form.code);
  const isCash = form.type === 'cash';

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, sort_order: String(total) });
    setOpen(true);
  };

  const openEdit = (m: PaymentMethod) => {
    setEditing(m);
    setForm(toForm(m));
    setOpen(true);
  };

  const changeType = (type: PaymentMethodType) =>
    setForm((f) => ({
      ...f,
      type,
      // cash has no transaction reference or account to show
      requires_reference: type === 'cash' ? false : f.requires_reference,
      account_number: type === 'cash' ? '' : f.account_number,
      account_name: type === 'cash' ? '' : f.account_name,
    }));

  const submit = async () => {
    const name = form.name.trim();
    const sortOrder = Number(form.sort_order);
    const accountNumber = form.account_number.trim() || null;
    const accountName = form.account_name.trim() || null;

    if (!name) {
      toast.error('Name is required.');
      return;
    }
    if (!editing && !CODE_RE.test(form.code)) {
      toast.error('Code must be 2-20 characters: lowercase letters, numbers or underscore.');
      return;
    }
    if (!Number.isInteger(sortOrder)) {
      toast.error('Order must be a whole number.');
      return;
    }
    if (!isCash && !accountNumber) {
      toast.error('Account number is required so the customer knows where to pay.');
      return;
    }

    try {
      if (editing) {
        await updateMethod({
          id: editing.id,
          body: {
            name,
            account_number: accountNumber,
            account_name: accountName,
            requires_reference: form.requires_reference,
            sort_order: sortOrder,
          },
        }).unwrap();
        toast.success('Payment method updated');
      } else {
        await createMethod({
          code: form.code,
          name,
          type: form.type,
          account_number: accountNumber,
          account_name: accountName,
          requires_reference: form.requires_reference,
          sort_order: sortOrder,
        }).unwrap();
        toast.success('Payment method created');
      }
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const toggleActive = async (m: PaymentMethod) => {
    try {
      await updateMethod({ id: m.id, body: { is_active: !m.is_active } }).unwrap();
      toast.success(m.is_active ? `${m.name} disabled` : `${m.name} enabled`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Payment methods</h1>
          <p className="text-sm text-muted-foreground">
            {total} methods. Customers see the active ones, in this order, on the pay screen.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-orange-600 hover:bg-orange-700">
          <Plus className="mr-2 h-4 w-4" /> Add payment method
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            aria-label="Search payment methods"
            placeholder="Search by name, code or account number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div role="group" aria-label="Filter by status" className="inline-flex rounded-lg border bg-white p-1">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={status === o.value}
              onClick={() => setStatus(o.value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                status === o.value ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-orange-50'
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground">Could not load payment methods.</p>
              <Button variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                {search.trim()
                  ? `No payment methods match "${search.trim()}".`
                  : total === 0
                    ? 'No payment methods yet. Add Cash, Telebirr or a bank account to get started.'
                    : status === 'inactive'
                      ? 'No disabled payment methods.'
                      : 'No active payment methods.'}
              </p>
              {search.trim() && (
                <Button variant="outline" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <div className={cn('overflow-x-auto', isFetching && 'opacity-60')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Order</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((m) => (
                    <TableRow key={m.id} className={cn(!m.is_active && 'text-zinc-500')}>
                      <TableCell className="tabular-nums">{m.sort_order}</TableCell>
                      <TableCell>
                        <p className="font-medium">{m.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{m.code}</p>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                          {TYPE_LABEL[m.type]}
                        </span>
                      </TableCell>
                      <TableCell>
                        {m.account_number ? (
                          <>
                            <p className="font-mono text-sm">{m.account_number}</p>
                            {m.account_name && (
                              <p className="text-xs text-muted-foreground">{m.account_name}</p>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{m.requires_reference ? 'Required' : 'Not needed'}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleActive(m)}
                          title={m.is_active ? 'Click to disable' : 'Click to enable'}
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-medium',
                            m.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                          )}
                        >
                          {m.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(m)} aria-label={`Edit ${m.name}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Add / edit payment method ---------- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add payment method'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pm-name">Name</Label>
              <Input id="pm-name" placeholder="Telebirr" value={form.name} onChange={set('name')} maxLength={80} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pm-code">Code</Label>
              <Input
                id="pm-code"
                placeholder="telebirr"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toLowerCase() }))}
                maxLength={20}
                disabled={Boolean(editing)}
                aria-invalid={codeInvalid}
                className="font-mono"
              />
              {editing ? (
                <p className="text-xs text-muted-foreground">Code and type cannot change after creation.</p>
              ) : codeInvalid ? (
                <p className="text-xs text-red-600">Lowercase letters, numbers, underscore. 2-20 characters.</p>
              ) : null}
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="pm-type">Type</Label>
              <select
                id="pm-type"
                value={form.type}
                disabled={Boolean(editing)}
                onChange={(e) => changeType(e.target.value as PaymentMethodType)}
                className="h-9 w-full rounded-md border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500"
              >
                {(Object.keys(TYPE_LABEL) as PaymentMethodType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>

            {!isCash && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="pm-account">Account number</Label>
                  <Input
                    id="pm-account"
                    inputMode="numeric"
                    value={form.account_number}
                    onChange={set('account_number')}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pm-holder">Account holder</Label>
                  <Input id="pm-holder" value={form.account_name} onChange={set('account_name')} maxLength={120} />
                </div>
                {editing && (
                  <p className="col-span-2 rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-800">
                    Customers send money to this account. Changes are recorded in the activity log.
                  </p>
                )}
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="pm-order">Display order</Label>
              <Input id="pm-order" type="number" min="0" step="1" value={form.sort_order} onChange={set('sort_order')} />
            </div>

            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.requires_reference}
                onChange={(e) => setForm((f) => ({ ...f, requires_reference: e.target.checked }))}
                className="h-4 w-4 accent-orange-600"
              />
              Seller must enter a reference
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving} className="bg-orange-600 hover:bg-orange-700">
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
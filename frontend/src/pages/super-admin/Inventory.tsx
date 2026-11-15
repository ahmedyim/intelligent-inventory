import { useState } from 'react';
import { ClipboardCheck, PackageMinus, PackagePlus, Search, SlidersHorizontal } from 'lucide-react';
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
import ProductImage from '@/components/ProductImage';
import { useAppSelector } from '@/app/hooks';
import {
  useGetInventoryQuery,
  useGetLowStockQuery,
  useGetMovementsQuery,
  useIssueStockMutation,
  useUpdateInventoryMutation,
} from '@/features/inventory/inventoryApi';
import type { InventoryItem, StockIssueBody } from '@/types/inventory';
import {
  useAdjustStockMutation,
  useGetProductsQuery,
  useReceiveStockMutation,
} from '@/features/products/productsApi';
// TODO: point this at your real branches hook. Expected data: [{ id: string; name: string }]
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

type IssueReason = StockIssueBody['reason'];

// Reasons for stock OUT. These must match the values your backend accepts.
const ISSUE_REASONS: { value: IssueReason; label: string }[] = [
  { value: 'damage', label: 'Damaged' },
  { value: 'loss', label: 'Lost / stolen' },
  { value: 'expired', label: 'Expired' },
  { value: 'sale', label: 'Sale' },
  { value: 'other', label: 'Other' },
];

type Tab = 'stock' | 'low' | 'movements';
type Mode = 'receive' | 'issue' | 'adjust';
type BranchOption = { id: string; name: string };

interface ActionTarget {
  id: string;
  name: string;
  sku: string;
  unit?: string;
  cost?: string;
}

interface ActionState {
  mode: Mode;
  product: ActionTarget | null; // null = pick a product in the dialog (top "Receive stock" button)
  branch_id: string;
  lockBranch: boolean;
  currentQty?: number;
}

interface ActionForm {
  quantity: string;
  unit_cost: string;
  new_selling_price: string;
  reason: IssueReason;
  note: string;
}

const emptyActionForm: ActionForm = {
  quantity: '',
  unit_cost: '',
  new_selling_price: '',
  reason: 'damage',
  note: '',
};

const TABS: { value: Tab; label: string }[] = [
  { value: 'stock', label: 'Stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'movements', label: 'Movements' },
];

const formatDate = (s?: string | null) => (s ? new Date(s).toLocaleString() : '-');

const errorMessage = (err: unknown) => {
  const detail = (err as { data?: { detail?: unknown } })?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return 'Something went wrong. Please try again.';
};

function BranchSelect({
  id,
  value,
  onChange,
  branches,
  disabled,
  allLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  branches: BranchOption[];
  disabled?: boolean;
  allLabel?: string; // when set, the empty option means "all branches" (filter use)
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500"
    >
      <option value="">{allLabel ?? 'Select branch'}</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

function QtyBadge({ qty, reorder }: { qty: number; reorder: number }) {
  const tone =
    qty <= 0 ? 'bg-red-50 text-red-700' : qty <= reorder ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700';
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums', tone)}>{qty}</span>
  );
}

function Pager({
  page,
  setPage,
  hasNext,
  info,
}: {
  page: number;
  setPage: (fn: (p: number) => number) => void;
  hasNext: boolean;
  info: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{info}</p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Page {page + 1}</span>
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

function EmptyOrError({
  isError,
  retry,
  empty,
}: {
  isError: boolean;
  retry: () => void;
  empty: string;
}) {
  return (
    <div className="p-6 text-center">
      <p className="mb-3 text-sm text-muted-foreground">{isError ? 'Could not load data.' : empty}</p>
      {isError && (
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export default function Inventory() {
  const user = useAppSelector((s) => s.auth.user);
  const lockedBranch = user?.branch_id ?? ''; // branch admins only see / act on their own branch

  const [tab, setTab] = useState<Tab>('stock');
  const [branchFilter, setBranchFilter] = useState(lockedBranch);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const [action, setAction] = useState<ActionState | null>(null);
  const [form, setForm] = useState<ActionForm>(emptyActionForm);
  const [pickerSearch, setPickerSearch] = useState('');

  const [reorderTarget, setReorderTarget] = useState<InventoryItem | null>(null);
  const [reorderValue, setReorderValue] = useState('');

  const debouncedSearch = useDebouncedValue(search, 300);
  const q = debouncedSearch.trim();
  const debouncedPicker = useDebouncedValue(pickerSearch, 300).trim();

  // back to page 1 when the sent search changes
  const [lastQ, setLastQ] = useState(q);
  if (lastQ !== q) {
    setLastQ(q);
    setPage(0);
  }

  const { data: branchData } = useGetBranchesQuery();
  // Adjust this line if your branches endpoint returns { items: [...] }
  const branches: BranchOption[] = (Array.isArray(branchData) ? branchData : []) as BranchOption[];
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id.slice(0, 8);

  const branchArg = branchFilter || undefined;
  const skip = page * PAGE_SIZE;

  const stockQ = useGetInventoryQuery(
    { branch_id: branchArg, search: q || undefined, skip, limit: PAGE_SIZE },
    { skip: tab !== 'stock' }
  );
  const lowQ = useGetLowStockQuery({ branch_id: branchArg, skip, limit: PAGE_SIZE }, { skip: tab !== 'low' });
  const movQ = useGetMovementsQuery({ branch_id: branchArg, skip, limit: PAGE_SIZE }, { skip: tab !== 'movements' });

  const needsPicker = action !== null && action.product === null;
  const pickerQ = useGetProductsQuery(
    { search: debouncedPicker || undefined, limit: 5, status: 'active' },
    { skip: !needsPicker }
  );

  const [receiveStock, { isLoading: receiving }] = useReceiveStockMutation();
  const [issueStock, { isLoading: issuing }] = useIssueStockMutation();
  const [adjustStock, { isLoading: adjusting }] = useAdjustStockMutation();
  const [updateInventory, { isLoading: updatingReorder }] = useUpdateInventoryMutation();
  const busy = receiving || issuing || adjusting;

  const changeTab = (t: Tab) => {
    setTab(t);
    setPage(0);
  };
  const changeBranch = (v: string) => {
    setBranchFilter(v);
    setPage(0);
  };

  const openAction = (mode: Mode, row: InventoryItem) => {
    const p = row.product;
    setAction({
      mode,
      product: p ? { id: p.id, name: p.name, sku: p.sku, unit: p.unit, cost: p.cost_price } : null,
      branch_id: row.branch_id,
      lockBranch: true,
      currentQty: row.quantity,
    });
    setForm({ ...emptyActionForm, unit_cost: p?.cost_price ? String(p.cost_price) : '' });
  };

  // Top button: receive for any product + branch, including branches with no stock row yet
  const openReceiveNew = () => {
    setAction({ mode: 'receive', product: null, branch_id: lockedBranch || branchFilter, lockBranch: Boolean(lockedBranch) });
    setForm(emptyActionForm);
    setPickerSearch('');
  };

  const closeAction = () => setAction(null);

  const submitAction = async () => {
    if (!action) return;
    const { mode, product, branch_id } = action;
    const qty = Number(form.quantity);

    if (!product) {
      toast.error('Choose a product.');
      return;
    }
    if (!branch_id) {
      toast.error('Choose a branch.');
      return;
    }
    if (form.quantity === '' || !Number.isInteger(qty)) {
      toast.error('Enter a whole number.');
      return;
    }

    try {
      if (mode === 'receive') {
        const unitCost = Number(form.unit_cost);
        if (qty <= 0) return void toast.error('Quantity must be greater than 0.');
        if (form.unit_cost === '' || Number.isNaN(unitCost) || unitCost < 0) {
          return void toast.error('Enter a valid unit cost.');
        }
        const newPrice = form.new_selling_price.trim();
        await receiveStock({
          product_id: product.id,
          branch_id,
          quantity: qty,
          unit_cost: unitCost,
          new_selling_price: newPrice === '' ? null : Number(newPrice),
          reason: 'purchase',
          note: form.note.trim() || null,
        }).unwrap();
        toast.success('Stock received');
      } else if (mode === 'issue') {
        if (qty <= 0) return void toast.error('Quantity must be greater than 0.');
        await issueStock({
          product_id: product.id,
          branch_id,
          quantity: qty,
          reason: form.reason,
          note: form.note.trim() || null,
        }).unwrap();
        toast.success('Stock issued');
      } else {
        if (qty < 0) return void toast.error('Counted quantity cannot be negative.');
        await adjustStock({
          product_id: product.id,
          branch_id,
          counted_quantity: qty,
          note: form.note.trim() || null,
        }).unwrap();
        toast.success('Stock count saved');
      }
      closeAction();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const openReorder = (row: InventoryItem) => {
    setReorderTarget(row);
    setReorderValue(row.reorder_level == null ? '' : String(row.reorder_level));
  };

  const submitReorder = async () => {
    if (!reorderTarget) return;
    const v = reorderValue.trim();
    const level = v === '' ? null : Number(v); // empty = back to the product's default level
    if (level !== null && (!Number.isInteger(level) || level < 0)) {
      toast.error('Reorder level must be a whole number, 0 or more.');
      return;
    }
    try {
      await updateInventory({ id: reorderTarget.id, reorder_level: level }).unwrap();
      toast.success('Reorder level saved');
      setReorderTarget(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const actionTitle =
    action?.mode === 'receive' ? 'Receive stock' : action?.mode === 'issue' ? 'Issue stock' : 'Stock count';

  // ---------------------------------------------------------------- render
  const stockItems = stockQ.data?.items ?? [];
  const stockTotal = stockQ.data?.total ?? 0;
  const lowItems = lowQ.data ?? [];
  const movItems = movQ.data?.items ?? [];
  const movTotal = movQ.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground">Stock per branch, low stock alerts and movement history.</p>
        </div>
        <Button onClick={openReceiveNew} className="bg-orange-600 hover:bg-orange-700">
          <PackagePlus className="mr-2 h-4 w-4" /> Receive stock
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Inventory view" className="inline-flex rounded-lg border bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={tab === t.value}
              onClick={() => changeTab(t.value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                tab === t.value ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-orange-50'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="w-48">
          <BranchSelect
            value={branchFilter}
            onChange={changeBranch}
            branches={branches}
            disabled={Boolean(lockedBranch)}
            allLabel="All branches"
          />
        </div>

        {tab === 'stock' && (
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              type="search"
              aria-label="Search stock"
              placeholder="Search by name, SKU or barcode"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </div>

      {/* ---------------- Stock tab ---------------- */}
      {tab === 'stock' && (
        <>
          <Card>
            <CardContent className="p-0">
              {stockQ.isError || stockItems.length === 0 ? (
                stockQ.isLoading ? (
                  <LoadingRows />
                ) : (
                  <EmptyOrError
                    isError={stockQ.isError}
                    retry={stockQ.refetch}
                    empty={q ? `No stock matches "${q}".` : 'No stock records yet. Use "Receive stock" to add some.'}
                  />
                )
              ) : (
                <div className={cn('overflow-x-auto', stockQ.isFetching && 'opacity-60')}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Reorder at</TableHead>
                        <TableHead>Last counted</TableHead>
                        <TableHead className="w-44" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockItems.map((row) => {
                        const effective = row.reorder_level ?? row.product?.reorder_level ?? 0;
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="max-w-64">
                              <div className="flex items-center gap-3">
                                <ProductImage src={row.product?.image_url} alt={row.product?.name ?? 'Product'} className="h-10 w-10" />
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{row.product?.name ?? row.product_id.slice(0, 8)}</p>
                                  <p className="font-mono text-xs text-muted-foreground">{row.product?.sku}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{branchName(row.branch_id)}</TableCell>
                            <TableCell className="text-right">
                              <QtyBadge qty={row.quantity} reorder={effective} />
                            </TableCell>
                            <TableCell className="text-right">
                              {effective}
                              {row.reorder_level == null && (
                                <span className="ml-1 text-xs text-muted-foreground">(default)</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(row.last_counted_at)}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end">
                                <Button variant="ghost" size="icon" title="Receive" aria-label="Receive stock" onClick={() => openAction('receive', row)}>
                                  <PackagePlus className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Issue" aria-label="Issue stock" onClick={() => openAction('issue', row)}>
                                  <PackageMinus className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Count" aria-label="Stock count" onClick={() => openAction('adjust', row)}>
                                  <ClipboardCheck className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Reorder level" aria-label="Edit reorder level" onClick={() => openReorder(row)}>
                                  <SlidersHorizontal className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          {stockTotal > 0 && (
            <Pager
              page={page}
              setPage={setPage}
              hasNext={skip + PAGE_SIZE < stockTotal}
              info={`Showing ${skip + 1}-${Math.min(stockTotal, skip + PAGE_SIZE)} of ${stockTotal}`}
            />
          )}
        </>
      )}

      {/* ---------------- Low stock tab ---------------- */}
      {tab === 'low' && (
        <>
          <Card>
            <CardContent className="p-0">
              {lowQ.isLoading ? (
                <LoadingRows />
              ) : lowQ.isError || lowItems.length === 0 ? (
                <EmptyOrError isError={lowQ.isError} retry={lowQ.refetch} empty="Nothing is low on stock." />
              ) : (
                <div className={cn('overflow-x-auto', lowQ.isFetching && 'opacity-60')}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Reorder at</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowItems.map((r) => (
                        <TableRow key={`${r.product_id}-${r.branch_id}`}>
                          <TableCell className="font-medium">{r.product_name}</TableCell>
                          <TableCell className="font-mono text-sm">{r.sku}</TableCell>
                          <TableCell>{branchName(r.branch_id)}</TableCell>
                          <TableCell className="text-right">
                            <QtyBadge qty={r.quantity} reorder={r.reorder_level} />
                          </TableCell>
                          <TableCell className="text-right">{r.reorder_level}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Receive"
                              aria-label={`Receive stock for ${r.product_name}`}
                              onClick={() => {
                                setAction({
                                  mode: 'receive',
                                  product: { id: r.product_id, name: r.product_name, sku: r.sku },
                                  branch_id: r.branch_id,
                                  lockBranch: true,
                                  currentQty: r.quantity,
                                });
                                setForm(emptyActionForm);
                              }}
                            >
                              <PackagePlus className="h-4 w-4" />
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
          {(page > 0 || lowItems.length > 0) && (
            <Pager
              page={page}
              setPage={setPage}
              hasNext={lowItems.length === PAGE_SIZE}
              info={`${lowItems.length} item${lowItems.length === 1 ? '' : 's'} on this page`}
            />
          )}
        </>
      )}

      {/* ---------------- Movements tab ---------------- */}
      {tab === 'movements' && (
        <>
          <Card>
            <CardContent className="p-0">
              {movQ.isLoading ? (
                <LoadingRows />
              ) : movQ.isError || movItems.length === 0 ? (
                <EmptyOrError isError={movQ.isError} retry={movQ.refetch} empty="No stock movements yet." />
              ) : (
                <div className={cn('overflow-x-auto', movQ.isFetching && 'opacity-60')}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                        <TableHead className="text-right">Before / After</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movItems.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDate(m.created_at)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {m.product_name ?? <span className="font-mono text-xs">{m.product_id.slice(0, 8)}</span>}
                          </TableCell>
                          <TableCell>{branchName(m.branch_id)}</TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-semibold tabular-nums',
                              m.quantity_change > 0 ? 'text-emerald-700' : 'text-red-700'
                            )}
                          >
                            {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {m.quantity_before} → {m.quantity_after}
                          </TableCell>
                          <TableCell className="text-sm">{m.reason}</TableCell>
                          <TableCell className="max-w-48 truncate text-sm text-muted-foreground">{m.note}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          {movTotal > 0 && (
            <Pager
              page={page}
              setPage={setPage}
              hasNext={skip + PAGE_SIZE < movTotal}
              info={`Showing ${skip + 1}-${Math.min(movTotal, skip + PAGE_SIZE)} of ${movTotal}`}
            />
          )}
        </>
      )}

      {/* ---------------- Receive / Issue / Count dialog ---------------- */}
      <Dialog open={action !== null} onOpenChange={(o) => !o && closeAction()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionTitle}
              {action?.product && `: ${action.product.name}`}
            </DialogTitle>
          </DialogHeader>

          {action && (
            <div className="grid grid-cols-2 gap-3">
              {/* product picker, only when opened from the top button */}
              {action.product === null ? (
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="picker">Product</Label>
                  <Input
                    id="picker"
                    placeholder="Search by name, SKU or barcode"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                  />
                  <div className="space-y-1">
                    {(pickerQ.data?.items ?? []).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setAction((a) =>
                            a ? { ...a, product: { id: p.id, name: p.name, sku: p.sku, unit: p.unit, cost: p.cost_price } } : a
                          );
                          setForm((f) => ({ ...f, unit_cost: String(p.cost_price) }));
                        }}
                        className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-orange-50"
                      >
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="ml-3 font-mono text-xs text-muted-foreground">{p.sku}</span>
                      </button>
                    ))}
                    {pickerQ.isSuccess && (pickerQ.data?.items.length ?? 0) === 0 && (
                      <p className="text-sm text-muted-foreground">No products found.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="col-span-2 flex items-center justify-between rounded-lg border bg-zinc-50 px-3 py-2 text-sm">
                  <span>
                    <span className="font-mono text-xs text-muted-foreground">{action.product.sku}</span>
                    {action.currentQty !== undefined && <span className="ml-3">Current: {action.currentQty}</span>}
                  </span>
                  {!action.lockBranch && action.currentQty === undefined && (
                    <button
                      type="button"
                      className="text-xs text-orange-700 underline"
                      onClick={() => setAction((a) => (a ? { ...a, product: null } : a))}
                    >
                      Change
                    </button>
                  )}
                </div>
              )}

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="act-branch">Branch</Label>
                <BranchSelect
                  id="act-branch"
                  value={action.branch_id}
                  onChange={(v) => setAction((a) => (a ? { ...a, branch_id: v } : a))}
                  branches={branches}
                  disabled={action.lockBranch}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="act-qty">
                  {action.mode === 'receive' ? 'Quantity received' : action.mode === 'issue' ? 'Quantity to remove' : 'Counted quantity'}
                </Label>
                <Input
                  id="act-qty"
                  type="number"
                  min="0"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>

              {action.mode === 'receive' && (
                <div className="space-y-1.5">
                  <Label htmlFor="act-cost">Unit cost</Label>
                  <Input
                    id="act-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unit_cost}
                    onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))}
                  />
                </div>
              )}

              {action.mode === 'receive' && (
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="act-price">New selling price (optional)</Label>
                  <Input
                    id="act-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.new_selling_price}
                    onChange={(e) => setForm((f) => ({ ...f, new_selling_price: e.target.value }))}
                  />
                </div>
              )}

              {action.mode === 'issue' && (
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="act-reason">Reason</Label>
                  <select
                    id="act-reason"
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as IssueReason }))}
                    className="h-9 w-full rounded-md border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  >
                    {ISSUE_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="act-note">Note (optional)</Label>
                <Input
                  id="act-note"
                  value={form.note}
                  maxLength={200}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeAction} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitAction} disabled={busy} className="bg-orange-600 hover:bg-orange-700">
              {busy ? 'Saving...' : action?.mode === 'receive' ? 'Receive' : action?.mode === 'issue' ? 'Issue' : 'Save count'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Reorder level dialog ---------------- */}
      <Dialog open={reorderTarget !== null} onOpenChange={(o) => !o && setReorderTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reorder level{reorderTarget?.product && `: ${reorderTarget.product.name}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reorder-level">
              Level for {reorderTarget ? branchName(reorderTarget.branch_id) : 'this branch'}
            </Label>
            <Input
              id="reorder-level"
              type="number"
              min="0"
              step="1"
              placeholder={`Default (${reorderTarget?.product?.reorder_level ?? '-'})`}
              value={reorderValue}
              onChange={(e) => setReorderValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave empty to use the product's default level.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReorderTarget(null)} disabled={updatingReorder}>
              Cancel
            </Button>
            <Button onClick={submitReorder} disabled={updatingReorder} className="bg-orange-600 hover:bg-orange-700">
              {updatingReorder ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
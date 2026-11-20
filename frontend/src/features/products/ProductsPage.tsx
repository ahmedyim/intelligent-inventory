import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Pencil, PackagePlus, Plus, Search } from 'lucide-react';
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
import ImageUploadButton from '@/features/products/ImageUploadButton';
import {
  useAdjustStockMutation,
  useCreateProductMutation,
  useGetProductsQuery,
  useReceiveStockMutation,
  useSetProductActiveMutation,
  useUpdateProductMutation,
  type ProductStatusFilter,
} from '@/features/products/productsApi';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';

const PAGE_SIZE = 20;
const IMAGE_URL_RE = /^https?:\/\/\S+$/i;

const STATUS_OPTIONS: { value: ProductStatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
];

interface FormState {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  image_url: string;
  unit: string;
  cost_price: string;
  selling_price: string;
  reorder_level: string;
  lead_time_days: string;
  initial_quantity: string;
  branch_id: string;
}

const emptyForm: FormState = {
  sku: '',
  barcode: '',
  name: '',
  description: '',
  image_url: '',
  unit: 'pcs',
  cost_price: '',
  selling_price: '',
  reorder_level: '10',
  lead_time_days: '7',
  initial_quantity: '',
  branch_id: '',
};

const toForm = (p: Product): FormState => ({
  sku: p.sku,
  barcode: p.barcode ?? '',
  name: p.name,
  description: p.description ?? '',
  image_url: p.image_url ?? '',
  unit: p.unit,
  cost_price: String(p.cost_price),
  selling_price: String(p.selling_price),
  reorder_level: String(p.reorder_level),
  lead_time_days: String(p.lead_time_days),
  initial_quantity: '',
  branch_id: '',
});

interface StockDialogState {
  mode: 'receive' | 'adjust';
  product: Product;
}

interface StockFormState {
  branch_id: string;
  quantity: string; // received quantity OR counted quantity
  unit_cost: string;
  new_selling_price: string;
  note: string;
}

type BranchOption = { id: string; name: string };

function BranchSelect({
  id,
  value,
  onChange,
  branches,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  branches: BranchOption[];
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500"
    >
      <option value="">Select branch</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

function StockBadge({ stock, reorder }: { stock: number; reorder: number }) {
  const tone =
    stock <= 0
      ? 'bg-red-50 text-red-700'
      : stock <= reorder
        ? 'bg-orange-50 text-orange-700'
        : 'bg-emerald-50 text-emerald-700';
  const label = stock <= 0 ? 'Out of stock' : stock <= reorder ? 'Low' : 'In stock';
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="font-medium tabular-nums">{stock}</span>
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tone)}>{label}</span>
    </div>
  );
}

interface ProductsPageProps {
  /** "/super-admin/products" or "/branch-admin/products": product links are built from it */
  basePath: string;
}

export default function ProductsPage({ basePath }: ProductsPageProps) {
  const user = useAppSelector((s) => s.auth.user);
  // Super admin has no branch_id: sees every branch. Anyone else is tied to their own branch.
  const branchId = user?.branch_id ?? undefined;
  const branchLocked = Boolean(branchId);

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>('active');
  const [lowStock, setLowStock] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [stockDialog, setStockDialog] = useState<StockDialogState | null>(null);
  const [stockForm, setStockForm] = useState<StockFormState>({
    branch_id: '',
    quantity: '',
    unit_cost: '',
    new_selling_price: '',
    note: '',
  });

  // Wait until the user stops typing before calling the API
  const debouncedSearch = useDebouncedValue(search, 300);
  const query = debouncedSearch.trim();

  // Go back to page 1 when the search text that is actually SENT changes
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setPage(0);
  }

  const { data, isLoading, isFetching, isError, refetch } = useGetProductsQuery({
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    search: query || undefined,
    status,
    low_stock: lowStock || undefined,
    branch_id: branchId,
  });
  const { data: branchData } = useGetBranchesQuery();
  // getBranches already returns a plain array (see branchesApi.transformResponse)
  const branches: BranchOption[] = (Array.isArray(branchData) ? branchData : []) as BranchOption[];

  const [createProduct, { isLoading: creating }] = useCreateProductMutation();
  const [updateProduct, { isLoading: updating }] = useUpdateProductMutation();
  const [setProductActive] = useSetProductActiveMutation();
  const [receiveStock, { isLoading: receiving }] = useReceiveStockMutation();
  const [adjustStock, { isLoading: adjusting }] = useAdjustStockMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const saving = creating || updating;
  const stockSaving = receiving || adjusting;
  const searching = query !== '';

  // Image link: validate right away, but only load the preview after the user pauses typing
  const imageUrl = form.image_url.trim();
  const imageInvalid = imageUrl !== '' && !IMAGE_URL_RE.test(imageUrl);
  const debouncedImage = useDebouncedValue(imageUrl, 500);
  const previewSrc = IMAGE_URL_RE.test(debouncedImage) ? debouncedImage : null;

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const setStock = (k: keyof StockFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setStockForm((f) => ({ ...f, [k]: e.target.value }));

  const changeStatus = (value: ProductStatusFilter) => {
    setStatus(value);
    setPage(0);
  };

  const toggleLowStock = () => {
    setLowStock((v) => !v);
    setPage(0);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, branch_id: branchId ?? '' });
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm(toForm(p));
    setOpen(true);
  };

  const openStock = (mode: 'receive' | 'adjust', p: Product) => {
    setStockDialog({ mode, product: p });
    setStockForm({
      branch_id: branchId ?? '',
      quantity: '',
      unit_cost: String(p.cost_price),
      new_selling_price: '',
      note: '',
    });
  };

  const errorMessage = (err: unknown) => {
    const detail = (err as { data?: { detail?: unknown } })?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    return 'Something went wrong. Please try again.';
  };

  const submit = async () => {
    const base = {
      sku: form.sku.trim(),
      barcode: form.barcode.trim() || null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null, // empty clears the image when editing
      unit: form.unit.trim() || 'pcs',
      cost_price: Number(form.cost_price),
      selling_price: Number(form.selling_price),
      reorder_level: Number(form.reorder_level),
      lead_time_days: Number(form.lead_time_days),
    };

    if (!base.sku || !base.name || Number.isNaN(base.selling_price)) {
      toast.error('SKU, name and selling price are required.');
      return;
    }
    if (!editing && Number.isNaN(base.cost_price)) {
      toast.error('Cost price is required.');
      return;
    }
    if (imageInvalid) {
      toast.error('Image link must start with http:// or https://');
      return;
    }

    const qty = Number(form.initial_quantity);
    const targetBranch = branchId ?? form.branch_id;
    if (!editing && qty > 0 && !targetBranch) {
      toast.error('Choose a branch for the opening stock.');
      return;
    }

    try {
      if (editing) {
        // Cost is NOT sent on edit: it is managed by "Receive stock" (weighted average).
        const { cost_price: _cost, ...body } = base;
        await updateProduct({ id: editing.id, body }).unwrap();
        toast.success('Product updated');
      } else {
        await createProduct({
          ...base,
          initial_stock: qty > 0 && targetBranch ? { branch_id: targetBranch, quantity: qty } : null,
        }).unwrap();
        toast.success('Product created');
      }
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const submitStock = async () => {
    if (!stockDialog) return;
    const { mode, product } = stockDialog;
    const qty = Number(stockForm.quantity);

    if (!stockForm.branch_id) {
      toast.error('Choose a branch.');
      return;
    }
    if (stockForm.quantity === '' || !Number.isInteger(qty)) {
      toast.error('Enter a whole number.');
      return;
    }

    try {
      if (mode === 'receive') {
        const unitCost = Number(stockForm.unit_cost);
        if (qty <= 0) {
          toast.error('Quantity must be greater than 0.');
          return;
        }
        if (Number.isNaN(unitCost) || unitCost < 0) {
          toast.error('Enter a valid unit cost.');
          return;
        }
        const newPrice = stockForm.new_selling_price.trim();
        await receiveStock({
          product_id: product.id,
          branch_id: stockForm.branch_id,
          quantity: qty,
          unit_cost: unitCost,
          new_selling_price: newPrice === '' ? null : Number(newPrice),
          reason: 'purchase',
          note: stockForm.note.trim() || null,
        }).unwrap();
        toast.success('Stock received');
      } else {
        if (qty < 0) {
          toast.error('Counted quantity cannot be negative.');
          return;
        }
        await adjustStock({
          product_id: product.id,
          branch_id: stockForm.branch_id,
          counted_quantity: qty,
          note: stockForm.note.trim() || null,
        }).unwrap();
        toast.success('Stock count saved');
      }
      setStockDialog(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const toggleActive = async (p: Product) => {
    try {
      await setProductActive({ id: p.id, active: !p.is_active }).unwrap();
      toast.success(p.is_active ? 'Product deactivated' : 'Product activated');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">
            {searching ? `${total} ${total === 1 ? 'match' : 'matches'} for "${query}"` : `${total} products`}
            {lowStock && ' (low stock only)'}
          </p>
        </div>
        <Button onClick={openCreate} className="bg-orange-600 hover:bg-orange-700">
          <Plus className="mr-2 h-4 w-4" /> Add product
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            aria-label="Search products"
            placeholder="Search by name, SKU or barcode"
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
              onClick={() => changeStatus(o.value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                status === o.value ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-orange-50'
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-pressed={lowStock}
          onClick={toggleLowStock}
          className={cn(
            'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
            lowStock ? 'border-orange-600 bg-orange-600 text-white' : 'bg-white text-zinc-600 hover:bg-orange-50'
          )}
        >
          Low stock only
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground">Could not load products.</p>
              <Button variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                {page > 0
                  ? 'There are no products on this page.'
                  : searching
                    ? `No products match "${query}".`
                    : lowStock
                      ? 'No products are low on stock.'
                      : status === 'inactive'
                        ? 'No inactive products.'
                        : 'No products found. Add your first product to get started.'}
              </p>
              {page > 0 && (
                <Button variant="outline" onClick={() => setPage(0)}>
                  Go to page 1
                </Button>
              )}
              {page === 0 && searching && (
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
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Reorder at</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-36" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-64">
                        <Link to={`${basePath}/${p.id}`} className="group flex items-center gap-3">
                          <ProductImage src={p.image_url} alt={p.name} className="h-10 w-10" />
                          <div className="min-w-0">
                            <p className="truncate font-medium group-hover:text-orange-600">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.unit}</p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                      <TableCell className="text-right">{formatMoney(Number(p.cost_price))}</TableCell>
                      <TableCell className="text-right">{formatMoney(Number(p.selling_price))}</TableCell>
                      <TableCell>
                        <StockBadge stock={p.total_stock} reorder={p.reorder_level} />
                      </TableCell>
                      <TableCell className="text-right">{p.reorder_level}</TableCell>
                      <TableCell>
                        {branchLocked ? (
                          // Active / inactive is a catalog-wide setting, so only the super admin changes it
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-xs font-medium',
                              p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                            )}
                          >
                            {p.is_active ? 'Active' : 'Inactive'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleActive(p)}
                            title={p.is_active ? 'Click to deactivate' : 'Click to activate'}
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-xs font-medium',
                              p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                            )}
                          >
                            {p.is_active ? 'Active' : 'Inactive'}
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openStock('receive', p)}
                            disabled={!p.is_active}
                            title="Receive stock"
                            aria-label={`Receive stock for ${p.name}`}
                          >
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openStock('adjust', p)}
                            title="Stock count"
                            aria-label={`Count stock for ${p.name}`}
                          >
                            <ClipboardCheck className="h-4 w-4" />
                          </Button>
                          {!branchLocked && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(p)}
                              aria-label={`Edit ${p.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
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

      {/* ---------- Add / edit product ---------- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit product' : 'Add product'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={form.name} onChange={set('name')} maxLength={150} />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="image_url">Product image (optional)</Label>
              <div className="flex items-start gap-3">
                <ProductImage src={previewSrc} alt="Image preview" className="h-16 w-16" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <ImageUploadButton onUploaded={(url) => setForm((f) => ({ ...f, image_url: url }))} />
                    {form.image_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setForm((f) => ({ ...f, image_url: '' }))}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <Input
                    id="image_url"
                    type="url"
                    inputMode="url"
                    placeholder="or paste an image link (https://...)"
                    value={form.image_url}
                    onChange={set('image_url')}
                    maxLength={500}
                    aria-invalid={imageInvalid}
                  />
                </div>
              </div>
              {imageInvalid && (
                <p className="text-sm text-red-600">The link must start with http:// or https://</p>
              )}
              <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Large photos are resized before they upload.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" value={form.sku} onChange={set('sku')} maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" value={form.barcode} onChange={set('barcode')} maxLength={64} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost">Cost price</Label>
              <Input
                id="cost"
                type="number"
                min="0"
                step="0.01"
                value={form.cost_price}
                onChange={set('cost_price')}
                disabled={Boolean(editing)}
              />
              {editing && (
                <p className="text-xs text-muted-foreground">Average cost. It changes when you receive stock.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">Selling price</Label>
              <Input id="price" type="number" min="0" step="0.01" value={form.selling_price} onChange={set('selling_price')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" value={form.unit} onChange={set('unit')} maxLength={20} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reorder">Reorder level</Label>
              <Input id="reorder" type="number" min="0" value={form.reorder_level} onChange={set('reorder_level')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead">Lead time (days)</Label>
              <Input id="lead" type="number" min="0" value={form.lead_time_days} onChange={set('lead_time_days')} />
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label htmlFor="qty">Opening stock</Label>
                <Input id="qty" type="number" min="0" value={form.initial_quantity} onChange={set('initial_quantity')} />
              </div>
            )}
            {!editing && Number(form.initial_quantity) > 0 && (
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="branch">Branch for opening stock</Label>
                <BranchSelect
                  id="branch"
                  value={branchId ?? form.branch_id}
                  onChange={(v) => setForm((f) => ({ ...f, branch_id: v }))}
                  branches={branches}
                  disabled={branchLocked}
                />
              </div>
            )}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="desc">Description</Label>
              <Input id="desc" value={form.description} onChange={set('description')} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving} className="bg-orange-600 hover:bg-orange-700">
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Receive stock / stock count ---------- */}
      <Dialog open={stockDialog !== null} onOpenChange={(o) => !o && setStockDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {stockDialog?.mode === 'receive' ? 'Receive stock' : 'Stock count'}
              {stockDialog && `: ${stockDialog.product.name}`}
            </DialogTitle>
          </DialogHeader>

          {stockDialog && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="stock-branch">Branch</Label>
                <BranchSelect
                  id="stock-branch"
                  value={stockForm.branch_id}
                  onChange={(v) => setStockForm((f) => ({ ...f, branch_id: v }))}
                  branches={branches}
                  disabled={branchLocked}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stock-qty">
                  {stockDialog.mode === 'receive' ? 'Quantity received' : 'Counted quantity'}
                </Label>
                <Input
                  id="stock-qty"
                  type="number"
                  min="0"
                  step="1"
                  value={stockForm.quantity}
                  onChange={setStock('quantity')}
                />
              </div>

              {stockDialog.mode === 'receive' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="stock-cost">Unit cost</Label>
                    <Input
                      id="stock-cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={stockForm.unit_cost}
                      onChange={setStock('unit_cost')}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="stock-price">New selling price (optional)</Label>
                    <Input
                      id="stock-price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={String(stockDialog.product.selling_price)}
                      value={stockForm.new_selling_price}
                      onChange={setStock('new_selling_price')}
                    />
                  </div>
                </>
              )}

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="stock-note">Note (optional)</Label>
                <Input id="stock-note" value={stockForm.note} onChange={setStock('note')} maxLength={200} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)} disabled={stockSaving}>
              Cancel
            </Button>
            <Button onClick={submitStock} disabled={stockSaving} className="bg-orange-600 hover:bg-orange-700">
              {stockSaving ? 'Saving...' : stockDialog?.mode === 'receive' ? 'Receive' : 'Save count'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
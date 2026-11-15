import { useMemo, useState } from 'react';
import { ScanBarcode, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/PageHeader';
import ProductImage from '@/components/ProductImage';
import { useGetBranchesQuery } from '@/features/branches/branchesApi';
import { useBranchScope } from '@/hooks/use-branch-scope';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { ROLE_HOME } from '@/lib/roles';
import { cn } from '@/lib/utils';
import type { PosStockItem } from '@/types';
import CartPanel from './CartPanel';
import {
    useCreateSaleMutation,
    useGetPaymentMethodsQuery,
    useGetPosStockQuery,
    useLazyGetPosStockQuery,
} from './posApi';
import SaleReceiptDialog, { type ReceiptData } from './SaleReceiptDialog';
import { planSale } from './salePlan';
import { useSaleDraft } from './useSaleDraft';
const STEP = 24;
const MAX_LIMIT = 192;

export default function PosPage() {
    const { role, lockedBranchId, missingBranch, isSuperAdmin } = useBranchScope();

    // ---- branch: staff are locked to theirs, a super admin picks one
    const { data: branches = [] } = useGetBranchesQuery();
    const activeBranches = useMemo(() => branches.filter((b) => b.status === 'ACTIVE'), [branches]);
    const [pickedBranch, setPickedBranch] = useState('');
    const branchId = lockedBranchId ?? (pickedBranch || (activeBranches.length === 1 ? (activeBranches[0]?.id ?? '') : ''));

    // ---- payment methods and the draft sale
    const { data: methods = [] } = useGetPaymentMethodsQuery();
    const defaultMethodId = (methods.find((m) => m.code === 'cash') ?? methods[0])?.id;
    const draft = useSaleDraft(defaultMethodId);
    const plan = useMemo(
        () => planSale(draft.lines, draft.discount, draft.payments, methods),
        [draft.lines, draft.discount, draft.payments, methods]
    );

    // ---- products
    const [search, setSearch] = useState('');
    const [limit, setLimit] = useState(STEP);
    const term = useDebouncedValue(search, 250).trim();
    const [focusOnLoad] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
    );

    const { data: stock, isLoading, isFetching, isError, refetch } = useGetPosStockQuery(
        { branch_id: branchId, search: term || undefined, limit },
        { skip: !branchId }
    );
    const [lookup] = useLazyGetPosStockQuery();
    const items = (stock?.items ?? []).filter((i) => i.product.is_active);
    const hasMore = (stock?.total ?? 0) > (stock?.items.length ?? 0) && limit < MAX_LIMIT;
    const inCart = new Map(draft.lines.map((l) => [l.product_id, l.qty]));

    // ---- checkout
    const [createSale, { isLoading: submitting }] = useCreateSaleMutation();
    const [receipt, setReceipt] = useState<ReceiptData | null>(null);
    const [cartOpen, setCartOpen] = useState(false);

    const today = new Date().toLocaleDateString('en-CA');
    const blocker: string | null =
        draft.lines.length === 0
            ? 'Add products to start a sale.'
            : (plan.errors[0] ??
                (plan.balance > 0 && !draft.customer
                    ? 'Choose a customer. The unpaid balance goes on credit.'
                    : plan.balance > 0 && !draft.dueDate
                        ? 'Set a due date for the unpaid balance.'
                        : plan.balance > 0 && draft.dueDate < today
                            ? 'The due date cannot be in the past.'
                            : null));

    const count = draft.lines.reduce((n, l) => n + l.qty, 0);
    const viewBase = role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN' ? `${ROLE_HOME[role]}/sales` : null;

    const addToCart = (item: PosStockItem) => {
        const p = item.product;
        const result = draft.addProduct({
            product_id: p.id,
            name: p.name,
            sku: p.sku,
            unit: p.unit,
            image_url: p.image_url,
            price: Number(p.selling_price),
            stock: item.quantity,
        });
        if (result === 'max') {
            toast.error(
                item.quantity <= 0 ? `${p.name} is out of stock.` : `Only ${item.quantity} ${p.unit} of ${p.name} in stock.`
            );
        }
    };

    // Barcode scanners type the code and press Enter
    const onSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const typed = search.trim();
        if (!typed || !branchId) return;

        try {
            const res = await lookup({ branch_id: branchId, search: typed, limit: 5 }, true).unwrap();
            const rows = res.items.filter((i) => i.product.is_active);
            const lower = typed.toLowerCase();
            const exact = rows.find((i) => i.product.barcode === typed || i.product.sku.toLowerCase() === lower);
            const pick = exact ?? (rows.length === 1 ? rows[0] : undefined);

            if (!pick) {
                toast.error(rows.length > 1 ? 'Several products match. Tap the one you want.' : `No product found for "${typed}".`);
                return;
            }
            addToCart(pick);
            setSearch('');
        } catch {
            toast.error('Could not look up that product.');
        }
    };

    const changeBranch = (id: string) => {
        if (draft.lines.length > 0) {
            draft.reset();
            toast.info('The cart was cleared because the branch changed.');
        }
        setPickedBranch(id);
        setSearch('');
        setLimit(STEP);
    };

    const complete = async () => {
        if (!branchId || blocker !== null || submitting) return;
        const lines = draft.lines;
        const customerName = draft.customer?.name ?? null;

        try {
            const sale = await createSale({
                branch_id: branchId,
                items: lines.map((l) => ({ product_id: l.product_id, quantity: l.qty })),
                discount: plan.discount,
                payments: plan.payments.map((p) => ({
                    payment_method_id: p.payment_method_id,
                    amount: p.amount,
                    reference: p.reference,
                })),
                customer_id: draft.customer?.id ?? null,
                due_date: plan.balance > 0 ? draft.dueDate : null,
                note: draft.note.trim() || null,
            }).unwrap();

            setReceipt({ sale, lines, change: plan.change, customerName });
            draft.reset();
            setCartOpen(false);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not complete the sale.'));
            refetch(); // the stock on screen may be out of date
        }
    };

    if (missingBranch) {
        return (
            <div className="space-y-4">
                <PageHeader title="New sale" />
                <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Your account is not assigned to a branch yet, so you cannot sell. Ask a super admin to assign you to a branch.
                </div>
            </div>
        );
    }

    const cartPanel = (
        <CartPanel draft={draft} plan={plan} methods={methods} blocker={blocker} submitting={submitting} onComplete={complete} />
    );

    return (
        <div className="space-y-4 pb-20 lg:pb-0">
            <PageHeader
                title="New sale"
                description="Search or scan products, check the cart, then take payment."
                action={
                    isSuperAdmin ? (
                        <Select value={branchId} onValueChange={changeBranch}>
                            <SelectTrigger className="w-52" aria-label="Branch">
                                <SelectValue placeholder="Select a branch" />
                            </SelectTrigger>
                            <SelectContent>
                                {activeBranches.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>
                                        {b.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : undefined
                }
            />

            <div className="grid gap-4 lg:grid-cols-[1fr_24rem] xl:grid-cols-[1fr_26rem]">
                {/* Products */}
                <section className="min-w-0 space-y-3">
                    <div className="relative">
                        <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                        <Input
                            type="search"
                            autoFocus={focusOnLoad}
                            aria-label="Search products or scan a barcode"
                            placeholder="Scan a barcode or search by name or SKU"
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setLimit(STEP);
                            }}
                            onKeyDown={onSearchKeyDown}
                            disabled={!branchId}
                            className="h-11 pl-10 text-base"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">Press Enter after typing or scanning a barcode to add it.</p>

                    {!branchId ? (
                        <p className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
                            Choose a branch to start selling.
                        </p>
                    ) : isError ? (
                        <div className="rounded-lg border bg-white p-6 text-center">
                            <p className="mb-3 text-sm text-muted-foreground">Could not load the products.</p>
                            <Button variant="outline" onClick={() => refetch()}>
                                Try again
                            </Button>
                        </div>
                    ) : isLoading ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <Skeleton key={i} className="h-56 w-full" />
                            ))}
                        </div>
                    ) : items.length === 0 ? (
                        <p className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
                            {term ? `No product in this branch matches "${term}".` : 'This branch has no products in stock records yet.'}
                        </p>
                    ) : (
                        <>
                            <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4', isFetching && 'opacity-60')}>
                                {items.map((item) => {
                                    const p = item.product;
                                    const qty = inCart.get(p.id) ?? 0;
                                    const out = item.quantity <= 0;
                                    const low = !out && item.quantity <= (item.reorder_level ?? p.reorder_level);
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            disabled={out}
                                            onClick={() => addToCart(item)}
                                            className={cn(
                                                'flex flex-col gap-2 rounded-xl border bg-white p-3 text-left transition hover:border-orange-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-50',
                                                qty > 0 && 'border-orange-400 ring-1 ring-orange-200'
                                            )}
                                        >
                                            <div className="relative">
                                                <ProductImage src={p.image_url} alt={p.name} className="aspect-square w-full" />
                                                {qty > 0 && (
                                                    <span className="absolute right-1.5 top-1.5 rounded-full bg-orange-600 px-2 py-0.5 text-xs font-semibold text-white">
                                                        {qty}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                                                <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
                                            </div>
                                            <div className="mt-auto flex items-end justify-between gap-2">
                                                <span className="text-sm font-semibold tabular-nums">{formatMoney(Number(p.selling_price))}</span>
                                                <span
                                                    className={cn(
                                                        'text-xs',
                                                        out ? 'font-medium text-red-600' : low ? 'text-amber-700' : 'text-muted-foreground'
                                                    )}
                                                >
                                                    {out ? 'Out of stock' : `${item.quantity} left`}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            {hasMore && (
                                <div className="text-center">
                                    <Button variant="outline" onClick={() => setLimit((l) => Math.min(MAX_LIMIT, l + STEP))}>
                                        Show more
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </section>

                {/* Cart: a side panel on large screens */}
                <aside className="hidden lg:block lg:self-start">
                    <Card className="sticky top-20 flex h-[calc(100dvh-6.5rem)] flex-col gap-0 overflow-hidden py-0">
                        <div className="flex items-center justify-between border-b p-4">
                            <h2 className="text-base font-semibold">Cart</h2>
                            <span className="text-sm text-muted-foreground">
                                {count} {count === 1 ? 'item' : 'items'}
                            </span>
                        </div>
                        {cartPanel}
                    </Card>
                </aside>
            </div>

            {/* Phones: a bar above the tab bar opens the cart as a sheet */}
            {draft.lines.length > 0 && (
                <div
                    className="fixed inset-x-0 z-20 border-t bg-white p-3 shadow-lg lg:hidden"
                    style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
                >
                    <Button
                        className="h-12 w-full justify-between bg-orange-600 text-base hover:bg-orange-700"
                        onClick={() => setCartOpen(true)}
                    >
                        <span className="flex items-center gap-2">
                            <ShoppingCart className="h-5 w-5" /> {count} {count === 1 ? 'item' : 'items'}
                        </span>
                        <span className="tabular-nums">{formatMoney(plan.total)} - Review</span>
                    </Button>
                </div>
            )}

            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
                <SheetContent side="bottom" className="h-[92dvh] gap-0 p-0 lg:hidden">
                    <SheetHeader className="border-b p-4">
                        <SheetTitle>Cart</SheetTitle>
                        <SheetDescription className="sr-only">Review the items and take payment.</SheetDescription>
                    </SheetHeader>
                    {cartPanel}
                </SheetContent>
            </Sheet>

            <SaleReceiptDialog
                receipt={receipt}
                viewHref={receipt && viewBase ? `${viewBase}/${receipt.sale.id}` : null}
                onClose={() => setReceipt(null)}
            />
        </div>
    );
}
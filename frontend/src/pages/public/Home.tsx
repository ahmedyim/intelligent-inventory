import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Check,
  Pill,
  ScanBarcode,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Warehouse,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import PublicBranches from '@/features/public/PublicBranches';
import PublicCatalog from '@/features/public/PublicCatalog';
import { useGetPublicStatsQuery } from '@/features/public/publicApi';
import { BRAND } from '@/lib/brand';
import { formatCount } from '@/lib/format';

const FEATURES = [
  { icon: Store, title: 'Multi-branch', text: 'Every branch manages its own stock, isolated from the others.' },
  { icon: ScanBarcode, title: 'Barcode ready', text: 'Sellers scan items to sell or look up stock in seconds.' },
  { icon: ShieldCheck, title: 'Role-based access', text: 'Super admins, branch admins and sellers each see only what they need.' },
  { icon: Boxes, title: 'Live stock', text: 'Quantities update as sales and deliveries are recorded.' },
];

const TENANTS = [
  { icon: Store, title: 'Retail shops', text: 'Track products, prices and sales across every shop you own.' },
  { icon: Warehouse, title: 'Warehouses', text: 'Control incoming, outgoing and transferred stock in one place.' },
  { icon: Pill, title: 'Pharmacies', text: 'Monitor quantities and spot low stock before it runs out.' },
];

const AI_POINTS = [
  'Demand forecasting from your sales history',
  'Low-stock and overstock alerts before they hurt',
  'Smart reorder suggestions per branch',
  'Ask questions about your inventory in plain language',
];

const STEPS = [
  { title: 'Create your business', text: 'Each business gets its own private workspace (tenant).' },
  { title: 'Add branches and staff', text: 'Assign branch admins and sellers with the right permissions.' },
  { title: 'Let AI do the heavy lifting', text: 'Get forecasts, alerts and reorder suggestions automatically.' },
];

export default function Home() {
  const { data: stats, isLoading: loadingStats, isError: statsFailed } = useGetPublicStatsQuery();

  const num = (n?: number) => (stats && n !== undefined ? formatCount(n) : '-');

  const statItems = stats
    ? [
      { value: formatCount(stats.branches), label: stats.branches === 1 ? 'Branch' : 'Branches' },
      { value: formatCount(stats.products), label: stats.products === 1 ? 'Product' : 'Products' },
      { value: formatCount(stats.units_in_stock), label: 'Items in stock' },
      ...(stats.sales_this_month != null
        ? [{ value: formatCount(stats.sales_this_month), label: 'Sales this month' }]
        : []),
    ]
    : [];

  return (
    <div className="space-y-24">
      {/* Hero */}
      <section className="grid items-center gap-10 py-12 md:grid-cols-2">
        <div className="text-center md:text-left">
          <Badge className="mb-4 bg-orange-100 text-orange-700 hover:bg-orange-100">
            <Sparkles className="mr-1 h-3 w-3" /> {BRAND.name}
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 md:text-5xl">
            AI-driven inventory for <span className="text-orange-600">every business and branch</span>
          </h1>
          <p className="mt-4 max-w-xl text-zinc-600 md:mx-0">{BRAND.tagline}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
            <Button asChild className="bg-orange-600 hover:bg-orange-700">
              <a href="#catalog">
                Browse catalog <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link to="/login">Staff login</Link>
            </Button>
          </div>
        </div>

        {/* Dashboard preview: the numbers are real, the bars are only an illustration */}
        <div className="rounded-2xl border bg-muted/40 p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Products', value: num(stats?.products) },
              { label: 'Branches', value: num(stats?.branches) },
              { label: 'Items in stock', value: num(stats?.units_in_stock) },
            ].map((t) => (
              <div key={t.label} className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{loadingStats ? '...' : t.value}</p>
              </div>
            ))}
          </div>
          <div aria-hidden className="mt-3 flex h-32 items-end gap-2 rounded-lg border bg-background p-3">
            {[40, 65, 50, 80, 60, 95, 75].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-orange-500/80" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-orange-50 p-3 text-sm text-orange-800">
            <Sparkles className="h-4 w-4 shrink-0" />
            AI suggests what each branch should reorder, based on its own sales.
          </div>
        </div>
      </section>

      {/* Who is it for */}
      <section className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight">Manage every business in a single system</h2>
        <p className="mt-2 text-muted-foreground">Who is {BRAND.name} suitable for?</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {TENANTS.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="transition-shadow hover:shadow-md">
              <CardHeader className="items-center text-center">
                <span className="mb-2 grid h-12 w-12 place-items-center rounded-xl bg-orange-100 text-orange-600">
                  <Icon className="h-6 w-6" />
                </span>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="transition-shadow hover:shadow-md">
            <CardHeader>
              <span className="mb-2 grid h-10 w-10 place-items-center rounded-lg bg-orange-100 text-orange-600">
                <Icon className="h-5 w-5" />
              </span>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      {/* AI */}
      <section className="grid items-center gap-10 md:grid-cols-2">
        <div className="grid h-64 place-items-center rounded-2xl bg-orange-50">
          <BarChart3 className="h-24 w-24 text-orange-500" />
        </div>
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Inventory that thinks ahead</h2>
          <p className="mt-3 text-muted-foreground">
            Stop guessing. Our AI learns from your sales and tells you what to buy, move or discount.
          </p>
          <ul className="mt-5 space-y-2">
            {AI_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                {p}
              </li>
            ))}
          </ul>
          <Button asChild className="mt-6 bg-orange-600 hover:bg-orange-700">
            <Link to="/about">Learn more</Link>
          </Button>
        </div>
      </section>

      {/* Live numbers from the backend. Hidden if they cannot be loaded: no invented figures. */}
      {!statsFailed && (
        <section className="rounded-2xl bg-muted/60 px-6 py-10" aria-label="Our numbers">
          {loadingStats ? (
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="mx-auto h-14 w-28" />
              ))}
            </div>
          ) : (
            <div
              className={
                statItems.length === 3
                  ? 'grid grid-cols-2 gap-6 text-center md:grid-cols-3'
                  : 'grid grid-cols-2 gap-6 text-center md:grid-cols-4'
              }
            >
              {statItems.map(({ value, label }) => (
                <div key={label}>
                  <p className="text-3xl font-bold tabular-nums text-orange-600">{value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* How it works */}
      <section className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-xl border p-6 text-left">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-orange-600 font-semibold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Catalog (from the backend) */}
      <section id="catalog" className="scroll-mt-20">
        <h2 className="mb-1 text-2xl font-semibold">Catalog</h2>
        <p className="mb-5 text-sm text-muted-foreground">What we sell and whether it is in stock right now.</p>
        <PublicCatalog />
      </section>

      {/* Branches (from the backend) */}
      <section id="branches" className="scroll-mt-20">
        <h2 className="mb-1 text-2xl font-semibold">Our branches</h2>
        <p className="mb-5 text-sm text-muted-foreground">Visit or call the branch nearest to you.</p>
        <PublicBranches />
      </section>

      {/* Final CTA */}
      <section className="rounded-2xl bg-orange-600 px-6 py-12 text-center text-white">
        <Truck className="mx-auto h-8 w-8" />
        <h2 className="mt-3 text-3xl font-semibold">Ready to take control of your stock?</h2>
        <p className="mx-auto mt-2 max-w-lg text-orange-100">Talk to us and we will set up your business workspace.</p>
        <Button asChild variant="secondary" className="mt-6">
          <Link to="/contact">
            <Building2 className="mr-2 h-4 w-4" /> Contact us
          </Link>
        </Button>
      </section>
    </div>
  );
}
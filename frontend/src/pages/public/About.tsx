import { Link } from 'react-router-dom';
import { Brain, Building2, Lock, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BRAND } from '@/lib/brand';

const VALUES = [
  { icon: Building2, title: 'Multi-tenant by design', text: 'Each business has its own isolated workspace, branches and staff.' },
  { icon: Brain, title: 'AI that helps', text: 'Forecasts and alerts that turn stock data into decisions.' },
  { icon: Lock, title: 'Secure access', text: 'Role-based permissions for super admins, branch admins and sellers.' },
];

export default function About() {
  return (
    <div className="space-y-16 py-12">
      <section className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          About <span className="text-orange-600">{BRAND.name}</span>
        </h1>
        <p className="mt-4 text-muted-foreground">
          {BRAND.name} helps businesses with one or many branches keep their inventory accurate,
          organized and ahead of demand.
        </p>
      </section>

      <section className="grid items-center gap-8 md:grid-cols-2">
        <div className="grid h-56 place-items-center rounded-2xl bg-orange-50">
          <Target className="h-20 w-20 text-orange-500" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Our mission</h2>
          <p className="mt-3 text-muted-foreground">
            Make professional inventory management simple for every business, from a single shop to a
            network of branches, by combining barcode workflows with practical AI.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {VALUES.map(({ icon: Icon, title, text }) => (
          <Card key={title}>
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

      <section className="text-center">
        <Button asChild className="bg-orange-600 hover:bg-orange-700">
          <Link to="/contact">Get in touch</Link>
        </Button>
      </section>
    </div>
  );
}
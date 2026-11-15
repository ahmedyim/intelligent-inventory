import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';


export interface BannerStat {
  label: string;
  value: number;
}

interface Props {
  title: string;
  subtitle: string;
  stats: BannerStat[];
  actions?: ReactNode;
  loading?: boolean;
}

export default function WelcomeBanner({ title, subtitle, stats, actions, loading }: Props) {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-orange-600 to-orange-700 p-6 text-white shadow-sm md:p-4">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="hidden h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 sm:grid">

          </span>
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
              <p className="mt-1 max-w-md text-sm text-orange-50">{subtitle}</p>
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="min-w-24 rounded-xl bg-white/15 px-4 py-3 ring-1 ring-white/25">
              <dd className="text-2xl font-bold">
                {loading ? <Skeleton className="h-8 w-10 bg-white/30" /> : s.value}
              </dd>
              <dt className="text-xs text-orange-50">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
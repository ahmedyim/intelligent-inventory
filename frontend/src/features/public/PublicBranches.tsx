import { Mail, MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetPublicBranchesQuery } from './publicApi';

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export default function PublicBranches() {
    const { data: branches = [], isLoading, isError, refetch } = useGetPublicBranchesQuery();

    if (isError) {
        return (
            <div className="rounded-xl border bg-white p-8 text-center">
                <p className="mb-3 text-sm text-muted-foreground">Our branches could not be loaded right now.</p>
                <Button variant="outline" onClick={() => refetch()}>
                    Try again
                </Button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                ))}
            </div>
        );
    }

    if (branches.length === 0) {
        return (
            <p className="rounded-xl border bg-white p-10 text-center text-sm text-muted-foreground">
                Our branch locations will appear here soon.
            </p>
        );
    }

    return (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
                <li key={b.id} className="space-y-3 rounded-xl border bg-white p-5">
                    <h3 className="text-base font-semibold">{b.name}</h3>
                    <ul className="space-y-2 text-sm text-zinc-600">
                        {b.location && (
                            <li className="flex items-start gap-2">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" /> {b.location}
                            </li>
                        )}
                        {b.phone && (
                            <li className="flex items-center gap-2">
                                <Phone className="h-4 w-4 shrink-0 text-orange-600" />
                                <a href={telHref(b.phone)} className="hover:text-orange-600 hover:underline">
                                    {b.phone}
                                </a>
                            </li>
                        )}
                        {b.email && (
                            <li className="flex items-center gap-2">
                                <Mail className="h-4 w-4 shrink-0 text-orange-600" />
                                <a href={`mailto:${b.email}`} className="min-w-0 truncate hover:text-orange-600 hover:underline">
                                    {b.email}
                                </a>
                            </li>
                        )}
                    </ul>
                </li>
            ))}
        </ul>
    );
}
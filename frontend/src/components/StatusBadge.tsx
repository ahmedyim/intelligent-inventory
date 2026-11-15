import { Badge } from '@/components/ui/badge';

const STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 hover:bg-green-100',
  INACTIVE: 'bg-zinc-100 text-zinc-700 hover:bg-zinc-100',
  SUSPENDED: 'bg-red-100 text-red-700 hover:bg-red-100',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STYLES[status] ?? STYLES.INACTIVE}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}
import { Loader2 } from 'lucide-react';

export default function SplashScreen() {
  return (
    <div role="status" aria-live="polite" className="grid min-h-screen place-items-center bg-zinc-50">
      <div className="flex flex-col items-center gap-3 text-zinc-500">
        <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  );
}
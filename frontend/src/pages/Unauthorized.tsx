import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Unauthorized() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
        <Button asChild className="bg-orange-600 hover:bg-orange-700">
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
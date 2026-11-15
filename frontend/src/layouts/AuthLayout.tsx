import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from '@/components/Logo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function AuthLayout({ title, description, children }: Props) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-orange-50 to-white p-4">
      <Logo className="mb-6" />

      <Card className="w-full max-w-sm shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>

      <Link to="/" className="mt-6 flex items-center gap-1 text-sm text-zinc-500 hover:text-orange-600">
        <ArrowLeft className="h-4 w-4" /> Back to website
      </Link>
    </div>
  );
}
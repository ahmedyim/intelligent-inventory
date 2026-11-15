import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/AuthLayout';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/lib/validators';
import { useResetPasswordMutation } from './authApi';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [resetPassword] = useResetPasswordMutation();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  if (!token) {
    return (
      <AuthLayout title="Invalid link">
        <div className="space-y-4 text-center">
          <p className="text-sm text-zinc-600">This reset link is missing or invalid. Please request a new one.</p>
          <Button asChild className="w-full bg-orange-600 hover:bg-orange-700">
            <Link to="/forgot-password">Request new link</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const onSubmit = async ({ password }: ResetPasswordFormValues) => {
    try {
      setError(null);
      await resetPassword({ token, password }).unwrap();
      toast.success('Password updated. Please log in.');
      navigate('/login', { replace: true });
    } catch {
      setError('This link has expired or is invalid. Please request a new one.');
    }
  };

  return (
    <AuthLayout title="Set a new password" description="Choose a strong password you haven't used before.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
          {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
          {errors.confirm && <p className="text-sm text-red-600">{errors.confirm.message}</p>}
        </div>
        <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Reset password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
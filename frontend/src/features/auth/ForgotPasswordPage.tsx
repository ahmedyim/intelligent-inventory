import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/AuthLayout';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/lib/validators';
import { useForgotPasswordMutation } from './authApi';

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [forgotPassword] = useForgotPasswordMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async ({ email }: ForgotPasswordFormValues) => {
    try {
      await forgotPassword({ email }).unwrap();
    } catch {
      // Ignored on purpose: never reveal whether an email exists
    }
    setSentTo(email);
  };

  // Success screen
  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <div className="space-y-4 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-orange-100 text-orange-600">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="text-sm text-zinc-600">
            If an account exists for <strong>{sentTo}</strong>, we sent a link to reset your password.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Back to login</Link>
          </Button>
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="text-sm text-orange-600 hover:underline"
          >
            Use a different email
          </button>
        </div>
      </AuthLayout>
    );
  }

  // Form screen
  return (
    <AuthLayout title="Forgot password?" description="Enter your email and we'll send you a reset link.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-red-600">
              {errors.email.message}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send reset link'}
        </Button>

        <p className="text-center text-sm">
          <Link to="/login" className="text-orange-600 hover:underline">
            Back to login
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
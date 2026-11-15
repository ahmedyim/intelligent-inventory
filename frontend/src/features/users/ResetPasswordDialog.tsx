import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/errors';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/lib/validators';
import { useResetUserPasswordMutation } from './usersApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export default function ResetPasswordDialog({ open, onOpenChange, userId, userName }: Props) {
  const [resetPassword, { isLoading }] = useResetUserPasswordMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  useEffect(() => {
    if (open) reset({ password: '', confirm: '' });
  }, [open, reset]);

  const onSubmit = async ({ password }: ResetPasswordFormValues) => {
    try {
      await resetPassword({ id: userId, new_password: password }).unwrap();
      toast.success(`Password reset. ${userName} was signed out of all devices.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not reset the password'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {userName}. They are signed out of every device and must log in again.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" {...register('password')} />
            {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" {...register('confirm')} />
            {errors.confirm && <p className="text-sm text-red-600">{errors.confirm.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Reset password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
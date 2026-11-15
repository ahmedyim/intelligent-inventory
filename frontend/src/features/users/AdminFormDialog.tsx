import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/errors';
import { userCreateSchema, type UserCreateFormValues } from '@/lib/validators';
import type { Branch } from '@/types';
import { useCreateUserMutation } from './usersApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Branch[];
}

type FormInput = z.input<typeof userCreateSchema>;

const EMPTY: FormInput = {
  full_name: '',
  email: '',
  phone: '',
  role: 'BRANCH_ADMIN', // the super admin only creates branch admins here
  branch_id: '',
  password: '',
};

export default function AdminFormDialog({ open, onOpenChange, branches }: Props) {
  const [createUser, { isLoading }] = useCreateUserMutation();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, UserCreateFormValues>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (open) reset(EMPTY);
  }, [open, reset]);

  const onSubmit = async (values: UserCreateFormValues) => {
    try {
      await createUser(values).unwrap();
      toast.success('Branch admin created');
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not create the admin'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New branch admin</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" {...register('full_name')} />
            {errors.full_name && <p className="text-sm text-red-600">{errors.full_name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="off" {...register('email')} />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" {...register('phone')} />
            {errors.phone && <p className="text-sm text-red-600">{errors.phone.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Branch</Label>
            <Controller
              control={control}
              name="branch_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.branch_id && <p className="text-sm text-red-600">{errors.branch_id.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Temporary password</Label>
            <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
            {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create admin'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
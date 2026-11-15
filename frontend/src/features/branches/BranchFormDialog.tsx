import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/errors';
import { branchSchema, type BranchFormValues } from '@/lib/validators';
import type { Branch } from '@/types';
import { useCreateBranchMutation, useUpdateBranchMutation } from './branchesApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch?: Branch; // present = edit mode
}

type FormInput = z.input<typeof branchSchema>;

export default function BranchFormDialog({ open, onOpenChange, branch }: Props) {
  const [createBranch, { isLoading: creating }] = useCreateBranchMutation();
  const [updateBranch, { isLoading: updating }] = useUpdateBranchMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, BranchFormValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: { name: '', location: '', email: '', phone: '' },
  });

  // Fill the form when editing, clear it when creating
  useEffect(() => {
    if (open) {
      reset({
        name: branch?.name ?? '',
        location: branch?.location ?? '',
        email: branch?.email ?? '',
        phone: branch?.phone ?? '',
      });
    }
  }, [open, branch, reset]);

  const onSubmit = async (values: BranchFormValues) => {
    try {
      if (branch) {
        // When editing, a cleared optional field is sent as null so it really gets cleared
        await updateBranch({
          id: branch.id,
          name: values.name,
          location: values.location,
          email: values.email ?? null,
          phone: values.phone ?? null,
        }).unwrap();
        toast.success('Branch updated');
      } else {
        await createBranch(values).unwrap();
        toast.success('Branch created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the branch'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{branch ? 'Edit branch' : 'New branch'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input id="location" {...register('location')} />
            {errors.location && <p className="text-sm text-red-600">{errors.location.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" {...register('phone')} />
            {errors.phone && <p className="text-sm text-red-600">{errors.phone.message}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700" disabled={creating || updating}>
              {creating || updating ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/errors';
import { useEditStaffUserMutation, type StaffEditBody } from './staffManageApi';

type EditableUser = {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: string;
  branch_id?: string | null;
  experience?: string | null;
  education_background?: string | null;
};

type BranchOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: EditableUser;
  branches: BranchOption[];
};

export default function StaffEditDialog({ open, onOpenChange, user, branches }: Props) {
  const [editUser, { isLoading }] = useEditStaffUserMutation();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'BRANCH_ADMIN' | 'SELLER'>('SELLER');
  const [branchId, setBranchId] = useState('');
  const [experience, setExperience] = useState('');
  const [education, setEducation] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fill the form with the current values every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setFullName(user.full_name);
    setEmail(user.email);
    setPhone(user.phone ?? '');
    setRole(user.role === 'BRANCH_ADMIN' ? 'BRANCH_ADMIN' : 'SELLER');
    setBranchId(user.branch_id ?? '');
    setExperience(user.experience ?? '');
    setEducation(user.education_background ?? '');
    setError(null);
  }, [open, user]);

  const nameOk = fullName.trim().length >= 3 && fullName.trim().length <= 50;
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const branchOk = role !== 'BRANCH_ADMIN' || !!branchId;
  const canSave = nameOk && emailOk && branchOk && !isLoading;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);

    // Send only what changed.
    const body: StaffEditBody = {};
    if (fullName.trim() !== user.full_name) body.full_name = fullName.trim();
    if (email.trim().toLowerCase() !== user.email.toLowerCase()) body.email = email.trim();
    // The API cannot clear a phone number, so an empty phone is simply not sent.
    if (phone.trim() && phone.trim() !== (user.phone ?? '')) body.phone = phone.trim();
    if (role !== user.role) body.role = role;
    if (branchId && branchId !== (user.branch_id ?? '')) body.branch_id = branchId;
    if (experience.trim() !== (user.experience ?? '')) body.experience = experience.trim();
    if (education.trim() !== (user.education_background ?? '')) body.education_background = education.trim();

    if (Object.keys(body).length === 0) {
      toast.info('No changes to save');
      onOpenChange(false);
      return;
    }

    try {
      await editUser({ id: user.id, body }).unwrap();
      toast.success('Staff updated');
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update this staff member'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isLoading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit staff</DialogTitle>
          <DialogDescription>Change this person's details. Use Reset password to change the password.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Full name</Label>
            <Input id="edit-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            {!nameOk && <p className="text-xs text-red-600">Use 3 to 50 characters.</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {!emailOk && <p className="text-xs text-red-600">Enter a valid email.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'BRANCH_ADMIN' | 'SELLER')}>
                <SelectTrigger aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SELLER">Seller</SelectItem>
                  <SelectItem value="BRANCH_ADMIN">Branch admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger aria-label="Branch">
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
              {!branchOk && <p className="text-xs text-red-600">A branch admin needs a branch.</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-experience">Experience</Label>
            <Input id="edit-experience" value={experience} onChange={(e) => setExperience(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-education">Education</Label>
            <Input id="edit-education" value={education} onChange={(e) => setEducation(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700" disabled={!canSave}>
              {isLoading ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
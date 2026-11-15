import { z } from 'zod';
import { emailRule, optionalPhone, passwordRule, requiredText } from './common';

export const userCreateSchema = z
  .object({
    full_name: requiredText('Full name'),
    email: emailRule,
    phone: optionalPhone,
    role: z.enum(['BRANCH_ADMIN', 'SELLER']), // super admins are not created from the UI
    branch_id: z.string().min(1, 'Select a branch'),
    password: passwordRule,
  });
export type UserCreateFormValues = z.infer<typeof userCreateSchema>;
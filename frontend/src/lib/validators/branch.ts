import { z } from 'zod';
import { optionalEmail, optionalPhone, requiredText } from './common';

export const branchSchema = z.object({
  name: requiredText('Name'),
  location: requiredText('Location'),
  email: optionalEmail,
  phone: optionalPhone,
});
export type BranchFormValues = z.infer<typeof branchSchema>;
import { z } from 'zod';
import { emailRule, requiredText } from './common';

export const contactSchema = z.object({
  name: requiredText('Name'),
  email: emailRule,
  message: z.string().trim().min(10, 'Write at least 10 characters').max(1000, 'Message is too long'),
});
export type ContactFormValues = z.infer<typeof contactSchema>;
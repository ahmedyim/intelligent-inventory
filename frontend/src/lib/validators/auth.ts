import { z } from 'zod';
import { emailRule, passwordRule } from './common';

export const loginSchema = z.object({
  email: emailRule,
  password: z.string().min(1, 'Password is required'), // don't enforce strength on login
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailRule,
});
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordRule,
    confirm: z.string().min(1, 'Confirm your password'),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
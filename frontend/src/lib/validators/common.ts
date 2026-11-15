import { z } from 'zod';

export const emailRule = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Enter a valid email address');

// Match your backend's rule. Raise the minimum, the old 4-8 limit is weak.
export const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters');


// Optional email: an empty string becomes undefined
export const optionalEmail = z
  .union([emailRule, z.literal('')])
  .optional()
  .transform((v) => v || undefined);
// Optional image link: empty becomes null, otherwise it must be an http(s) URL
export const imageUrlRule = z
  .string()
  .trim()
  .max(500, 'Link is too long')
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Enter a link starting with http:// or https://')
  .optional()
  .transform((v) => v || null);
export const phoneRule = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,15}$/, 'Enter a valid phone number');

// Optional text field: empty string becomes undefined
export const optionalPhone = z
  .union([phoneRule, z.literal('')])
  .optional()
  .transform((v) => v || undefined);

export const requiredText = (label: string, min = 2) =>
  z.string().trim().min(min, `${label} must be at least ${min} characters`);
import { z } from 'zod';
import { imageUrlRule, requiredText } from './common';

export const productSchema = z.object({
  name: requiredText('Name'),
  sku: requiredText('SKU', 1),
  barcode: z.string().trim().optional(),
  description: z.string().trim().optional(),
  image_url: imageUrlRule,
  unit: requiredText('Unit', 1),
  cost_price: z.coerce.number().min(0, 'Cost cannot be negative'),
  selling_price: z.coerce.number().min(0, 'Price cannot be negative'),
  reorder_level: z.coerce.number().int('Whole numbers only').min(0, 'Cannot be negative'),
  lead_time_days: z.coerce.number().int('Whole numbers only').min(0, 'Cannot be negative'),
});
export type ProductFormValues = z.infer<typeof productSchema>;
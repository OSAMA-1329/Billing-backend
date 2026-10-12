import { z } from 'zod';
import { PRODUCT_UNITS } from '../utils/units.js';

export const stockAdjustmentSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid product id'),
  quantity: z.number().finite().refine((quantity) => quantity !== 0, 'Quantity change cannot be zero'),
  unit: z.enum(PRODUCT_UNITS).optional(),
  note: z.string().trim().max(120).optional(),
});
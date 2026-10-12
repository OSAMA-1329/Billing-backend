import { z } from 'zod';
import { PRODUCT_UNITS } from '../utils/units.js';

const salesItemSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid product id'),
  quantity: z.number().positive(),
  unit: z.enum(PRODUCT_UNITS).optional(),
}).strict();

export const salesSchema = z.object({
  customerId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid customer id').optional(),
  items: z.array(salesItemSchema).min(1),
  discount: z.number().min(0).default(0),
  paidAmount: z.number().min(0).default(0),
  paymentMethod: z.enum(['Cash', 'Card', 'UPI', 'Credit']),
  clientRequestId: z.string().min(1).max(100).optional(),
}).strict();

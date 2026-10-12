import { z } from 'zod';
import { PRODUCT_UNITS } from '../utils/units.js';

export const productSchema = z.object({
  itemCode: z.string().min(1),
  barcode: z.string().optional().or(z.literal('')),
  productName: z.string().min(1),
  tamilProductName: z.string().optional(),
  unit: z.enum(PRODUCT_UNITS).optional(),
  hsnCode: z.string().optional(),
  manufacturer: z.string().optional(),
  mrp: z.number().min(0),
  purchaseCost: z.number().min(0),
  marginPercent: z.number().min(0).optional(),
  gstPercent: z.number().min(0).optional(),
  retailPrice: z.number().min(0),
  wholesalePrice: z.number().min(0).optional(),
  pointPercent: z.number().min(0).optional(),
  openingStock: z.number().min(0).optional(),
  godownLocation: z.string().optional(),
  lowStockThreshold: z.number().min(0).optional(),
});

export const productUpdateSchema = productSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field required',
});

export const bulkDeleteProductsSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f\d]{24}$/i, 'Invalid product id')).min(1).max(100),
});

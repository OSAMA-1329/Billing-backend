import { z } from 'zod';
import { PRODUCT_UNITS } from '../utils/units.js';

const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  productCode: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(PRODUCT_UNITS).optional(),
  mrp: z.number().min(0).optional(),
  crossAmount: z.number().min(0).optional(),
  purchaseRate: z.number().min(0),
  pdPercent: z.number().optional(),
  marginPercent: z.number().optional(),
  retailPrice: z.number().min(0).optional(),
  wholesalePrice: z.number().min(0).optional(),
  total: z.number().min(0),
});

export const purchaseSchema = z.object({
  serialNumber: z.string().optional(),
  supplierId: z.string().optional(),
  supplierName: z.string().min(1),
  place: z.string().optional(),
  invoiceDate: z.coerce.date(),
  invoiceMode: z.string().optional(),
  externalInvoiceNumber: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1),
  productsValue: z.number().min(0),
  lessAmount: z.number().min(0).optional(),
  roundOff: z.number().optional(),
  totalAmount: z.number().min(0),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
});

export const purchaseUpdateSchema = purchaseSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

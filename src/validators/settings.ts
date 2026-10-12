import { z } from 'zod';

export const settingsSchema = z.object({
  shopName: z.string().trim().min(1).max(120),
  address: z.string().max(500),
  phone: z.string().max(30),
  gstNumber: z.string().max(30),
  currencySymbol: z.string().trim().min(1).max(5),
  lowStockDefault: z.number().int().min(0).max(99999),
});
import { z } from 'zod';

export const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  openingBalance: z.number().optional(),
  place: z.string().optional(),
});

export const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
  openingBalance: z.number().optional(),
});

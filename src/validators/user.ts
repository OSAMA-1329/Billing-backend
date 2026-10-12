import { z } from 'zod';

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: 'At least one field is required',
});
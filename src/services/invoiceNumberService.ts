import { InvoiceCounter } from '../models/InvoiceCounter.js';

export async function generateInvoiceNumber(prefix: 'SALE' | 'PUR'): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const counter = await InvoiceCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(6, '0');
  return `${prefix}-${year}-${seq}`;
}

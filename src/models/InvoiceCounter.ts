import mongoose, { Schema } from 'mongoose';

const invoiceCounterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export const InvoiceCounter = mongoose.model('InvoiceCounter', invoiceCounterSchema);

import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const supplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    gstNumber: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    place: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

export type SupplierDocument = InferSchemaType<typeof supplierSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Supplier = mongoose.model('Supplier', supplierSchema);

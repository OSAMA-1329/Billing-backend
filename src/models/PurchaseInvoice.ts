import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const purchaseItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productCode: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, enum: ['Kg', 'g', 'L', 'ml', 'Pcs', 'Pkt'] },
    baseQuantity: { type: Number, min: 0 },
    baseUnit: { type: String, enum: ['g', 'ml', 'pcs'] },
    mrp: { type: Number, default: 0, min: 0 },
    crossAmount: { type: Number, default: 0, min: 0 },
    purchaseRate: { type: Number, required: true, min: 0 },
    pdPercent: { type: Number, default: 0 },
    marginPercent: { type: Number, default: 0 },
    retailPrice: { type: Number, default: 0, min: 0 },
    wholesalePrice: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const purchaseInvoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    serialNumber: { type: String, trim: true, default: '' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', index: true },
    supplierName: { type: String, required: true, trim: true },
    place: { type: String, trim: true, default: '' },
    invoiceDate: { type: Date, required: true, index: true },
    invoiceMode: { type: String, trim: true, default: 'Cash' },
    items: { type: [purchaseItemSchema], default: [] },
    productsValue: { type: Number, default: 0, min: 0 },
    lessAmount: { type: Number, default: 0, min: 0 },
    roundOff: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'CANCELLED'], default: 'COMPLETED' },
    stockApplied: { type: Boolean, default: false },
    externalInvoiceNumber: { type: String, trim: true, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseInvoiceSchema.index({ createdAt: -1 });

export type PurchaseInvoiceDocument = InferSchemaType<typeof purchaseInvoiceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PurchaseInvoice = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);

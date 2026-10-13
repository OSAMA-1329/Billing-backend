import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const salesItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productCode: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, enum: ['Kg', 'g', 'L', 'ml', 'Pcs', 'Pkt'] },
    baseQuantity: { type: Number, min: 0 },
    baseUnit: { type: String, enum: ['g', 'ml', 'pcs'] },
    priceUnit: { type: String, enum: ['Kg', 'g', 'L', 'ml', 'Pcs', 'Pkt'] },
    price: { type: Number, required: true, min: 0 },
    retailPrice: { type: Number, default: 0 },
    wholesalePrice: { type: Number, default: 0 },
    discount: { type: Number, default: 0, min: 0 },
    gst: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const salesInvoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    customerName: { type: String, default: 'Walk-in Customer', trim: true },
    customerPhone: { type: String, default: '', trim: true },
    items: { type: [salesItemSchema], default: [] },
    subtotal: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    gst: { type: Number, default: 0, min: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    balanceAmount: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'Card', 'UPI', 'Credit'],
      default: 'Cash',
    },
    stockApplied: { type: Boolean, default: false },
    clientRequestId: { type: String, sparse: true, unique: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

salesInvoiceSchema.index({ createdAt: -1 });

export type SalesInvoiceDocument = InferSchemaType<typeof salesInvoiceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SalesInvoice = mongoose.model('SalesInvoice', salesInvoiceSchema);

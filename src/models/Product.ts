import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const productSchema = new Schema(
  {
    itemCode: { type: String, required: true, unique: true, trim: true, index: true },
    barcode: { type: String, trim: true, sparse: true, unique: true, index: true },
    productName: { type: String, required: true, trim: true, index: true },
    tamilProductName: { type: String, trim: true, default: '' },
    unit: { type: String, enum: ['Kg', 'g', 'L', 'ml', 'Pcs', 'Pkt'], default: 'Pcs' },
    hsnCode: { type: String, trim: true, default: '' },
    manufacturer: { type: String, trim: true, default: '' },
    mrp: { type: Number, required: true, min: 0 },
    purchaseCost: { type: Number, required: true, min: 0 },
    marginPercent: { type: Number, default: 0, min: 0 },
    gstPercent: { type: Number, default: 0, min: 0 },
    retailPrice: { type: Number, required: true, min: 0 },
    wholesalePrice: { type: Number, default: 0, min: 0 },
    pointPercent: { type: Number, default: 0, min: 0 },
    availableStock: { type: Number, default: 0, min: 0 },
    stockBaseQuantity: { type: Number, min: 0 },
    godownLocation: { type: String, trim: true, default: '' },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
  },
  { timestamps: true }
);

productSchema.index({ productName: 'text', itemCode: 'text', barcode: 'text' });

export type ProductDocument = InferSchemaType<typeof productSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Product = mongoose.model('Product', productSchema);

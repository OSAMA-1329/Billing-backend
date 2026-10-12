import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const stockMovementSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    type: {
      type: String,
      enum: ['PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN'],
      required: true,
    },
    quantity: { type: Number, required: true },
    unit: { type: String, enum: ['Kg', 'g', 'L', 'ml', 'Pcs', 'Pkt'] },
    baseQuantity: { type: Number, min: 0 },
    baseUnit: { type: String, enum: ['g', 'ml', 'pcs'] },
    referenceId: { type: Schema.Types.ObjectId, index: true },
    referenceNumber: { type: String, trim: true },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    previousBaseStock: { type: Number, min: 0 },
    newBaseStock: { type: Number, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.index({ createdAt: -1 });

export type StockMovementDocument = InferSchemaType<typeof stockMovementSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

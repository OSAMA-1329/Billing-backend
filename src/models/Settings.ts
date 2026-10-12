import mongoose, { Schema } from 'mongoose';

const settingsSchema = new Schema(
  {
    shopName: { type: String, default: 'My Shop' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    currencySymbol: { type: String, default: '₹' },
    lowStockDefault: { type: Number, default: 5 },
  },
  { timestamps: true }
);

export const Settings = mongoose.model('Settings', settingsSchema);

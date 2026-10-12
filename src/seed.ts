import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { User } from './models/User.js';
import { Supplier } from './models/Supplier.js';
import { Customer } from './models/Customer.js';
import { Product } from './models/Product.js';
import { Settings } from './models/Settings.js';
import { createPurchase } from './services/purchaseService.js';
import { createSale } from './services/salesService.js';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI required');
  process.exit(1);
}

await connectDB(uri);

await Promise.all([
  User.deleteMany({}),
  Supplier.deleteMany({}),
  Customer.deleteMany({}),
  Product.deleteMany({}),
  Settings.deleteMany({}),
]);

const adminHash = await bcrypt.hash('123', 10);
const admin = await User.create({
  name: 'Admin',
  email: 'ar@gmail.com',
  password: adminHash,
  role: 'ADMIN',
});

await Settings.create({ shopName: 'Demo Shop', phone: '9876543210', address: 'Main Street' });

const suppliers = await Supplier.insertMany([
  { name: 'ABC Distributors', phone: '9000000001', place: 'Chennai', currentBalance: 0 },
  { name: 'Fresh Foods Wholesale', phone: '9000000002', place: 'Coimbatore', currentBalance: 0 },
  { name: 'Metro Supplies', phone: '9000000003', place: 'Madurai', currentBalance: 0 },
]);

const customers = await Customer.insertMany([
  { name: 'Walk-in Customer', phone: '', currentBalance: 0 },
  { name: 'Ravi Stores', phone: '9111111111', currentBalance: 500 },
  { name: 'Priya Mart', phone: '9222222222', currentBalance: 0 },
]);

const productTemplates = [
  { itemCode: 'P001', barcode: '8901000000001', productName: 'Rice 1Kg', tamilProductName: 'அரிசி 1Kg', unit: 'Pkt', mrp: 60, purchaseCost: 48, retailPrice: 55, wholesalePrice: 52, gstPercent: 0, availableStock: 100 },
  { itemCode: 'P002', barcode: '8901000000002', productName: 'Sugar 1Kg', tamilProductName: 'சர்க்கரை', unit: 'Pkt', mrp: 50, purchaseCost: 42, retailPrice: 48, wholesalePrice: 45, gstPercent: 0, availableStock: 80 },
  { itemCode: 'P003', barcode: '8901000000003', productName: 'Sunflower Oil 1L', unit: 'Pkt', mrp: 180, purchaseCost: 155, retailPrice: 175, wholesalePrice: 168, gstPercent: 5, availableStock: 60 },
  { itemCode: 'P004', barcode: '8901000000004', productName: 'Tea Powder 250g', unit: 'Pkt', mrp: 120, purchaseCost: 95, retailPrice: 115, wholesalePrice: 110, gstPercent: 5, availableStock: 45 },
  { itemCode: 'P005', barcode: '8901000000005', productName: 'Milk 500ml', unit: 'Pkt', mrp: 28, purchaseCost: 24, retailPrice: 27, wholesalePrice: 26, gstPercent: 0, availableStock: 120 },
  { itemCode: 'P006', barcode: '8901000000006', productName: 'Bread', unit: 'Pcs', mrp: 40, purchaseCost: 32, retailPrice: 38, wholesalePrice: 36, gstPercent: 0, availableStock: 30 },
  { itemCode: 'P007', barcode: '8901000000007', productName: 'Eggs (6)', unit: 'Pkt', mrp: 45, purchaseCost: 38, retailPrice: 44, wholesalePrice: 42, gstPercent: 0, availableStock: 50 },
  { itemCode: 'P008', barcode: '8901000000008', productName: 'Dal 1Kg', unit: 'Pkt', mrp: 140, purchaseCost: 118, retailPrice: 135, wholesalePrice: 128, gstPercent: 0, availableStock: 70 },
  { itemCode: 'P009', barcode: '8901000000009', productName: 'Salt 1Kg', unit: 'Pkt', mrp: 25, purchaseCost: 18, retailPrice: 22, wholesalePrice: 20, gstPercent: 0, availableStock: 200 },
  { itemCode: 'P010', barcode: '8901000000010', productName: 'Biscuits Pack', unit: 'Pkt', mrp: 30, purchaseCost: 22, retailPrice: 28, wholesalePrice: 26, gstPercent: 12, availableStock: 90 },
  { itemCode: 'P011', barcode: '8901000000011', productName: 'Soap', unit: 'Pcs', mrp: 35, purchaseCost: 26, retailPrice: 33, wholesalePrice: 30, gstPercent: 18, availableStock: 100 },
  { itemCode: 'P012', barcode: '8901000000012', productName: 'Shampoo 180ml', unit: 'Pcs', mrp: 180, purchaseCost: 140, retailPrice: 175, wholesalePrice: 165, gstPercent: 18, availableStock: 40 },
  { itemCode: 'P013', barcode: '8901000000013', productName: 'Toothpaste', unit: 'Pcs', mrp: 95, purchaseCost: 72, retailPrice: 90, wholesalePrice: 85, gstPercent: 18, availableStock: 55 },
  { itemCode: 'P014', barcode: '8901000000014', productName: 'Detergent 1Kg', unit: 'Pkt', mrp: 110, purchaseCost: 88, retailPrice: 105, wholesalePrice: 98, gstPercent: 18, availableStock: 65 },
  { itemCode: 'P015', barcode: '8901000000015', productName: 'Mineral Water 1L', unit: 'Pcs', mrp: 20, purchaseCost: 14, retailPrice: 18, wholesalePrice: 16, gstPercent: 12, availableStock: 150 },
  { itemCode: 'P016', barcode: '8901000000016', productName: 'Soft Drink 750ml', unit: 'Pcs', mrp: 40, purchaseCost: 32, retailPrice: 38, wholesalePrice: 35, gstPercent: 12, availableStock: 80 },
  { itemCode: 'P017', barcode: '8901000000017', productName: 'Onion 1Kg', unit: 'Kg', mrp: 45, purchaseCost: 35, retailPrice: 42, wholesalePrice: 38, gstPercent: 0, availableStock: 100 },
  { itemCode: 'P018', barcode: '8901000000018', productName: 'Potato 1Kg', unit: 'Kg', mrp: 40, purchaseCost: 30, retailPrice: 38, wholesalePrice: 34, gstPercent: 0, availableStock: 120 },
  { itemCode: 'P019', barcode: '8901000000019', productName: 'Tomato 1Kg', unit: 'Kg', mrp: 50, purchaseCost: 38, retailPrice: 48, wholesalePrice: 44, gstPercent: 0, availableStock: 90 },
  { itemCode: 'P020', barcode: '8901000000020', productName: 'Banana 1Kg', unit: 'Kg', mrp: 60, purchaseCost: 45, retailPrice: 55, wholesalePrice: 50, gstPercent: 0, availableStock: 75 },
];

const products = await Product.insertMany(
  productTemplates.map((p) => ({
    ...p,
    manufacturer: 'Generic',
    hsnCode: '2106',
    marginPercent: 10,
    pointPercent: 1,
    godownLocation: 'A1',
    lowStockThreshold: 10,
  }))
);

const purchaseItems = products.slice(0, 5).map((p) => ({
  productId: String(p._id),
  productCode: p.itemCode,
  productName: p.productName,
  quantity: 10,
  mrp: p.mrp,
  purchaseRate: p.purchaseCost,
  retailPrice: p.retailPrice,
  wholesalePrice: p.wholesalePrice,
  total: 10 * p.purchaseCost,
}));

const productsValue = purchaseItems.reduce((s, i) => s + i.total, 0);

await createPurchase(
  {
    supplierId: String(suppliers[0]._id),
    supplierName: suppliers[0].name,
    place: suppliers[0].place,
    invoiceDate: new Date(),
    invoiceMode: 'Credit',
    items: purchaseItems,
    productsValue,
    lessAmount: 0,
    roundOff: 0,
    totalAmount: productsValue,
    status: 'COMPLETED',
  },
  String(admin._id)
);

const saleItems = products.slice(5, 8).map((p) => ({
  productId: String(p._id),
  quantity: 2,
}));

await createSale(
  {
    customerId: String(customers[1]._id),
    items: saleItems,
    discount: 0,
    paidAmount: 0,
    paymentMethod: 'Cash',
    clientRequestId: `seed-sale-${Date.now()}`,
  },
  String(admin._id)
);

console.log('Seed complete.');
console.log('Login: artraders@gmail.com / 123');
await mongoose.disconnect();

import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import app from '../app.js';
import { Product } from '../models/Product.js';
import { SalesInvoice } from '../models/SalesInvoice.js';
import { Supplier } from '../models/Supplier.js';
import { User } from '../models/User.js';
import { createPurchase, deletePurchase } from './purchaseService.js';
import { createSale, deleteSale, updateSale } from './salesService.js';

type SaleLineInput = Parameters<typeof createSale>[0]['items'][number];

const testUri = process.env.MONGODB_TEST_URI;
let productSequence = 0;

function closeTo(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to be close to ${expected}`);
}

async function addProduct(unit: 'Kg' | 'g' | 'L' | 'ml' | 'Pcs' | 'Pkt', stock: number, retailPrice: number) {
  productSequence += 1;
  return Product.create({
    itemCode: `QTEST-${Date.now()}-${productSequence}`,
    productName: `Quantity test ${productSequence}`,
    unit,
    mrp: retailPrice,
    purchaseCost: retailPrice / 2,
    retailPrice,
    wholesalePrice: retailPrice,
    availableStock: stock,
    gstPercent: 0,
  });
}

async function bill(items: SaleLineInput[]) {
  return createSale({
    items,
    discount: 0,
    paidAmount: 0,
    paymentMethod: 'Cash',
  });
}

describe('standalone sales quantity integration', { skip: !testUri }, () => {
  before(async () => {
    const databaseName = new URL(testUri!).pathname.slice(1);
    if (!databaseName.includes('quantity-test')) {
      throw new Error('MONGODB_TEST_URI must use a dedicated database containing "quantity-test" in its name');
    }
    await mongoose.connect(testUri!);
    await mongoose.connection.db!.dropDatabase();
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db!.dropDatabase();
      await mongoose.disconnect();
    }
  });

  test('1 kg stock, sell 500 g: ₹27.50 and 500 g remain', async () => {
    const product = await addProduct('Kg', 1, 55);
    const invoice = await bill([{ productId: String(product._id), quantity: 500, unit: 'g' }]);
    const updated = await Product.findById(product._id);
    assert.equal(invoice.items[0].total, 27.5);
    assert.equal(invoice.items[0].quantity, 500);
    assert.equal(invoice.items[0].unit, 'g');
    assert.equal(invoice.items[0].baseQuantity, 500);
    assert.equal(invoice.items[0].baseUnit, 'g');
    closeTo(updated!.stockBaseQuantity!, 500);
    closeTo(updated!.availableStock, 0.5);
  });

  test('1 kg stock, sell 250 g: ₹13.75 and 750 g remain', async () => {
    const product = await addProduct('Kg', 1, 55);
    const invoice = await bill([{ productId: String(product._id), quantity: 250, unit: 'g' }]);
    const updated = await Product.findById(product._id);
    assert.equal(invoice.items[0].total, 13.75);
    closeTo(updated!.stockBaseQuantity!, 750);
    closeTo(updated!.availableStock, 0.75);
  });

  test('10 kg stock, sell 1.5 kg', async () => {
    const product = await addProduct('Kg', 10, 55);
    const invoice = await bill([{ productId: String(product._id), quantity: 1.5, unit: 'Kg' }]);
    const updated = await Product.findById(product._id);
    assert.equal(invoice.items[0].total, 82.5);
    closeTo(updated!.stockBaseQuantity!, 8500);
    closeTo(updated!.availableStock, 8.5);
  });

  test('5 L stock, sell 500 ml', async () => {
    const product = await addProduct('L', 5, 120);
    const invoice = await bill([{ productId: String(product._id), quantity: 500, unit: 'ml' }]);
    const updated = await Product.findById(product._id);
    assert.equal(invoice.items[0].total, 60);
    closeTo(updated!.stockBaseQuantity!, 4500);
    closeTo(updated!.availableStock, 4.5);
  });

  test('2 L stock, sell 1.25 L', async () => {
    const product = await addProduct('L', 2, 120);
    const invoice = await bill([{ productId: String(product._id), quantity: 1.25, unit: 'L' }]);
    const updated = await Product.findById(product._id);
    assert.equal(invoice.items[0].total, 150);
    closeTo(updated!.stockBaseQuantity!, 750);
    closeTo(updated!.availableStock, 0.75);
  });

  test('50 pieces, sell 3 pieces without dimensional conversion', async () => {
    const product = await addProduct('Pcs', 50, 10);
    const invoice = await bill([{ productId: String(product._id), quantity: 3, unit: 'Pcs' }]);
    const updated = await Product.findById(product._id);
    assert.equal(invoice.items[0].total, 30);
    assert.equal(invoice.items[0].baseUnit, 'pcs');
    assert.equal(updated!.stockBaseQuantity, 47);
    assert.equal(updated!.availableStock, 47);
  });

  test('rejects overselling and rolls back earlier lines in the same bill', async () => {
    const first = await addProduct('Kg', 2, 55);
    const second = await addProduct('L', 1, 120);
    const invoiceCount = await SalesInvoice.countDocuments();
    await assert.rejects(bill([
      { productId: String(first._id), quantity: 500, unit: 'g' },
      { productId: String(second._id), quantity: 1500, unit: 'ml' },
    ]));
    const firstAfter = await Product.findById(first._id);
    const secondAfter = await Product.findById(second._id);
    closeTo(firstAfter!.availableStock, 2);
    closeTo(firstAfter!.stockBaseQuantity!, 2000);
    closeTo(secondAfter!.availableStock, 1);
    closeTo(secondAfter!.stockBaseQuantity!, 1000);
    assert.equal(await SalesInvoice.countDocuments(), invoiceCount);
  });

  test('calculates and deducts multiple unit families in one bill', async () => {
    const rice = await addProduct('Kg', 1, 55);
    const biscuit = await addProduct('Pcs', 10, 10);
    const invoice = await bill([
      { productId: String(rice._id), quantity: 250, unit: 'g' },
      { productId: String(biscuit._id), quantity: 2, unit: 'Pcs' },
    ]);
    const riceAfter = await Product.findById(rice._id);
    const biscuitAfter = await Product.findById(biscuit._id);
    assert.equal(invoice.subtotal, 33.75);
    assert.equal(invoice.grandTotal, 33.75);
    closeTo(riceAfter!.stockBaseQuantity!, 750);
    assert.equal(biscuitAfter!.stockBaseQuantity, 8);
  });

  test('handles consecutive decimal sales against the latest stock', async () => {
    const product = await addProduct('Kg', 1, 55);
    await bill([{ productId: String(product._id), quantity: 500, unit: 'g' }]);
    await bill([{ productId: String(product._id), quantity: 250, unit: 'g' }]);
    const updated = await Product.findById(product._id);
    closeTo(updated!.stockBaseQuantity!, 250);
    closeTo(updated!.availableStock, 0.25);
  });

  test('handles 2.25 kg decimal sale without rounding stock', async () => {
    const product = await addProduct('Kg', 2.5, 55);
    const invoice = await bill([{ productId: String(product._id), quantity: 2.25, unit: 'Kg' }]);
    const updated = await Product.findById(product._id);
    assert.equal(invoice.items[0].total, 123.75);
    closeTo(updated!.stockBaseQuantity!, 250);
    closeTo(updated!.availableStock, 0.25);
  });

  test('sale deletion restores normalized stock', async () => {
    const product = await addProduct('Kg', 1, 55);
    const invoice = await bill([{ productId: String(product._id), quantity: 500, unit: 'g' }]);
    await deleteSale(String(invoice._id));
    const updated = await Product.findById(product._id);
    closeTo(updated!.stockBaseQuantity!, 1000);
    closeTo(updated!.availableStock, 1);
  });

  test('editing a sale updates stock without changing its invoice number', async () => {
    const product = await addProduct('Kg', 1, 55);
    const invoice = await bill([{ productId: String(product._id), quantity: 500, unit: 'g' }]);

    const updatedInvoice = await updateSale(String(invoice._id), {
      items: [{ productId: String(product._id), quantity: 250, unit: 'g' }],
      discount: 0,
      paidAmount: 0,
      paymentMethod: 'Cash',
    });
    const updatedProduct = await Product.findById(product._id);

    assert.equal(updatedInvoice.invoiceNumber, invoice.invoiceNumber);
    assert.equal(updatedInvoice.items[0].quantity, 250);
    closeTo(updatedProduct!.stockBaseQuantity!, 750);
    closeTo(updatedProduct!.availableStock, 0.75);
  });

  test('deleting a sale keeps the next invoice number in sequence', async () => {
    const product = await addProduct('Pcs', 3, 10);
    const deletedInvoice = await bill([{ productId: String(product._id), quantity: 1, unit: 'Pcs' }]);
    await deleteSale(String(deletedInvoice._id));
    const nextInvoice = await bill([{ productId: String(product._id), quantity: 1, unit: 'Pcs' }]);

    const deletedSequence = Number(deletedInvoice.invoiceNumber.split('-').at(-1));
    const nextSequence = Number(nextInvoice.invoiceNumber.split('-').at(-1));
    assert.equal(nextSequence, deletedSequence + 1);
  });

  test('legacy Kg and Pkt products infer their existing unit when omitted', async () => {
    const legacyKg = await addProduct('Kg', 2, 55);
    const legacyPkt = await addProduct('Pkt', 50, 10);
    const kgInvoice = await bill([{ productId: String(legacyKg._id), quantity: 0.5 }]);
    const pktInvoice = await bill([{ productId: String(legacyPkt._id), quantity: 3 }]);
    const kgAfter = await Product.findById(legacyKg._id);
    const pktAfter = await Product.findById(legacyPkt._id);
    assert.equal(kgInvoice.items[0].unit, 'Kg');
    assert.equal(kgInvoice.items[0].total, 27.5);
    closeTo(kgAfter!.stockBaseQuantity!, 1500);
    assert.equal(pktInvoice.items[0].total, 30);
    assert.equal(pktInvoice.items[0].baseUnit, 'pcs');
    assert.equal(pktAfter!.availableStock, 47);
  });

  test('purchase receipts and deletion update normalized stock', async () => {
    const product = await addProduct('Kg', 1, 55);
    const supplier = await Supplier.create({ name: 'Quantity test supplier', currentBalance: 0 });
    const purchase = await createPurchase({
      supplierId: String(supplier._id),
      supplierName: supplier.name,
      invoiceDate: new Date(),
      items: [{
        productId: String(product._id),
        productCode: product.itemCode,
        productName: product.productName,
        quantity: 500,
        unit: 'g',
        mrp: 55,
        purchaseRate: 55,
        retailPrice: 55,
        wholesalePrice: 55,
        total: 27.5,
      }],
      productsValue: 27.5,
      lessAmount: 0,
      roundOff: 0,
      totalAmount: 27.5,
      status: 'COMPLETED',
    });
    const afterReceipt = await Product.findById(product._id);
    closeTo(afterReceipt!.stockBaseQuantity!, 1500);
    closeTo(afterReceipt!.availableStock, 1.5);

    await deletePurchase(String(purchase._id));
    const afterDelete = await Product.findById(product._id);
    closeTo(afterDelete!.stockBaseQuantity!, 1000);
    closeTo(afterDelete!.availableStock, 1);
  });

  test('authenticated sales API completes billing and returns normalized stock', async () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'quantity-test-jwt-secret';
    const user = await User.create({
      name: 'Quantity API Test',
      email: `quantity-api-${Date.now()}@shop.local`,
      password: await bcrypt.hash('test-password-123', 10),
      role: 'ADMIN',
    });
    const product = await addProduct('Kg', 1, 55);
    const server = app.listen(0);
    try {
      await once(server, 'listening');
      const address = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}/api`;
      const loginResponse = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: 'test-password-123' }),
      });
      assert.equal(loginResponse.status, 200);
      const login = await loginResponse.json() as { data: { token: string } };

      const saleResponse = await fetch(`${baseUrl}/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${login.data.token}`,
        },
        body: JSON.stringify({
          items: [{ productId: String(product._id), quantity: 500, unit: 'g' }],
          discount: 0,
          paidAmount: 0,
          paymentMethod: 'Cash',
          clientRequestId: `quantity-api-${Date.now()}`,
        }),
      });
      assert.equal(saleResponse.status, 201);
      const sale = await saleResponse.json() as { data: { _id: string; invoiceNumber: string; grandTotal: number } };
      assert.equal(sale.data.grandTotal, 27.5);

      const detailResponse = await fetch(`${baseUrl}/sales/${sale.data._id}`, {
        headers: { Authorization: `Bearer ${login.data.token}` },
      });
      assert.equal(detailResponse.status, 200);
      const details = await detailResponse.json() as {
        data: { _id: string; invoiceNumber: string; items: { productName: string; quantity: number; total: number }[] };
      };
      assert.equal(details.data._id, sale.data._id);
      assert.equal(details.data.invoiceNumber, sale.data.invoiceNumber);
      assert.equal(details.data.items.length, 1);
      assert.equal(details.data.items[0].productName, product.productName);
      assert.equal(details.data.items[0].quantity, 500);
      assert.equal(details.data.items[0].total, 27.5);

      const invoiceLookupResponse = await fetch(`${baseUrl}/sales/${sale.data.invoiceNumber}`, {
        headers: { Authorization: `Bearer ${login.data.token}` },
      });
      assert.equal(invoiceLookupResponse.status, 200);

      const updated = await Product.findById(product._id);
      closeTo(updated!.stockBaseQuantity!, 500);
      closeTo(updated!.availableStock, 0.5);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
});
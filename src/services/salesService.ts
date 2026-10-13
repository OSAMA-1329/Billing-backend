import mongoose from 'mongoose';
import { SalesInvoice } from '../models/SalesInvoice.js';
import { Customer } from '../models/Customer.js';
import { Product } from '../models/Product.js';
import { generateInvoiceNumber } from './invoiceNumberService.js';
import { applyStockChange } from './stockService.js';
import { AppError } from '../utils/AppError.js';
import { roundCurrency } from '../utils/calculations.js';
import {
  areUnitsCompatible,
  calculateUnitPriceAmount,
  convertToBaseQuantity,
  getBaseUnit,
  normalizeUnit,
} from '../utils/units.js';
import type { z } from 'zod';
import type { salesSchema } from '../validators/sales.js';

type SalesInput = z.infer<typeof salesSchema>;

export async function createSale(data: SalesInput, userId?: string) {
  if (data.clientRequestId) {
    const dup = await SalesInvoice.findOne({ clientRequestId: data.clientRequestId }).lean();
    if (dup) return dup;
  }

  let invoiceId: mongoose.Types.ObjectId | undefined;
  let invoiceNumberForRollback: string | undefined;
  let invoiceCustomerId: mongoose.Types.ObjectId | undefined;
  let createdCustomerId: mongoose.Types.ObjectId | undefined;
  let invoiceBalanceAmount = 0;
  const appliedStock: { productId: mongoose.Types.ObjectId; quantity: number }[] = [];
  let customerBalanceUpdated = false;
  try {
    let customer = data.customerId
      ? await Customer.findById(data.customerId)
      : null;
    if (data.customerId && !customer) throw new AppError('Customer not found', 404);
    const customerName = data.customerName?.trim();
    const customerPhone = data.customerPhone?.trim() || '';
    if (!customer && customerName) {
      customer = await Customer.findOne({ name: customerName, phone: customerPhone });
      if (!customer) {
        customer = await Customer.create({ name: customerName, phone: customerPhone });
        createdCustomerId = customer._id;
      }
    }
    if (data.paymentMethod === 'Credit' && !customer) {
      throw new AppError('Select a customer for credit sales', 400);
    }

    const pricedItems = [];
    let subtotal = 0;
    for (const item of data.items) {
      const product = await Product.findById(item.productId);
      if (!product) throw new AppError('Product not found', 404);
      const unit = normalizeUnit(item.unit ?? product.unit);
      const priceUnit = normalizeUnit(product.unit);
      if (!areUnitsCompatible(unit, priceUnit)) {
        throw new AppError(`Cannot sell ${product.productName} in ${unit}; its price is configured per ${priceUnit}`, 400);
      }
      if (getBaseUnit(unit) === 'pcs' && !Number.isInteger(item.quantity)) {
        throw new AppError(`${product.productName} must be sold in whole pieces`, 400);
      }
      const baseQuantity = convertToBaseQuantity(item.quantity, unit);
      const lineSubtotal = roundCurrency(
        calculateUnitPriceAmount(item.quantity, unit, product.retailPrice, priceUnit)
      );
      subtotal = roundCurrency(subtotal + lineSubtotal);
      pricedItems.push({
        productId: product._id,
        productCode: product.itemCode,
        productName: product.productName,
        quantity: item.quantity,
        unit,
        baseQuantity,
        baseUnit: getBaseUnit(unit),
        priceUnit,
        price: product.retailPrice,
        retailPrice: product.retailPrice,
        wholesalePrice: product.wholesalePrice,
        lineSubtotal,
        gstPercent: product.gstPercent,
      });
    }

    const discount = data.discount ?? 0;
    if (discount > subtotal) throw new AppError('Discount cannot exceed the subtotal', 400);

    let allocatedDiscount = 0;
    const items = pricedItems.map((item, index) => {
      const remainingDiscount = roundCurrency(Math.max(0, discount - allocatedDiscount));
      const lineDiscount = index === pricedItems.length - 1
        ? remainingDiscount
        : Math.min(remainingDiscount, roundCurrency(discount * item.lineSubtotal / (subtotal || 1)));
      allocatedDiscount = roundCurrency(allocatedDiscount + lineDiscount);
      const total = roundCurrency(item.lineSubtotal - lineDiscount);
      return {
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        baseQuantity: item.baseQuantity,
        baseUnit: item.baseUnit,
        priceUnit: item.priceUnit,
        price: item.price,
        retailPrice: item.retailPrice,
        wholesalePrice: item.wholesalePrice,
        discount: lineDiscount,
        gst: roundCurrency(total * item.gstPercent / 100),
        total,
      };
    });
    const gst = roundCurrency(items.reduce((sum, item) => sum + item.gst, 0));
    const roundOff = 0;
    const grandTotal = roundCurrency(subtotal - discount + gst);
    const paidAmount = data.paymentMethod === 'Credit' ? data.paidAmount ?? 0 : grandTotal;
    if (paidAmount > grandTotal) throw new AppError('Amount received cannot exceed the invoice total', 400);
    const balanceAmount = roundCurrency(Math.max(0, grandTotal - paidAmount));
    const invoiceNumber = await generateInvoiceNumber('SALE');
    const invoice = await SalesInvoice.create({
      invoiceNumber,
      customerId: customer?._id,
      customerName: customer?.name || data.customerName?.trim() || 'Walk-in Customer',
      customerPhone: customer?.phone || data.customerPhone?.trim() || '',
      items,
      subtotal,
      discount,
      gst,
      roundOff,
      grandTotal,
      paidAmount,
      balanceAmount,
      paymentMethod: data.paymentMethod,
      clientRequestId: data.clientRequestId,
      stockApplied: false,
      createdBy: userId,
    });
    invoiceId = invoice._id;
    invoiceNumberForRollback = invoice.invoiceNumber;
    invoiceCustomerId = invoice.customerId as mongoose.Types.ObjectId | undefined;
    invoiceBalanceAmount = invoice.balanceAmount;

    for (const item of invoice.items) {
      const baseQuantity = item.baseQuantity ?? convertToBaseQuantity(
        item.quantity,
        normalizeUnit(item.unit ?? item.priceUnit ?? 'Pcs')
      );
      await applyStockChange({
        productId: item.productId as mongoose.Types.ObjectId,
        quantityDelta: -baseQuantity,
        type: 'SALE',
        referenceId: invoice._id,
        referenceNumber: invoice.invoiceNumber,
      });
      appliedStock.push({
        productId: item.productId as mongoose.Types.ObjectId,
        quantity: baseQuantity,
      });
    }

    if (customer && invoice.paymentMethod === 'Credit' && invoice.balanceAmount > 0) {
      const update = await Customer.updateOne(
        { _id: customer._id },
        { $inc: { currentBalance: invoice.balanceAmount } }
      );
      if (!update.matchedCount) throw new AppError('Customer not found', 404);
      customerBalanceUpdated = true;
    }

    invoice.stockApplied = true;
    await invoice.save();
    return invoice;
  } catch (e) {
    if (customerBalanceUpdated && invoiceCustomerId) {
      try {
        await Customer.updateOne(
          { _id: invoiceCustomerId },
          { $inc: { currentBalance: -invoiceBalanceAmount } }
        );
      } catch (rollbackError) {
        console.error('Failed to roll back customer balance after sale error', rollbackError);
      }
    }

    for (const item of appliedStock.reverse()) {
      try {
        await applyStockChange({
          productId: item.productId,
          quantityDelta: item.quantity,
          type: 'RETURN',
          referenceId: invoiceId,
          referenceNumber: invoiceNumberForRollback,
        });
      } catch (rollbackError) {
        console.error('Failed to roll back stock after sale error', rollbackError);
      }
    }

    if (invoiceId) {
      try {
        await SalesInvoice.deleteOne({ _id: invoiceId });
      } catch (rollbackError) {
        console.error('Failed to remove incomplete sale invoice', rollbackError);
      }
    }

    if (createdCustomerId) {
      try {
        await Customer.deleteOne({ _id: createdCustomerId });
      } catch (rollbackError) {
        console.error('Failed to remove customer after sale error', rollbackError);
      }
    }

    if ((e as { code?: number }).code === 11000 && data.clientRequestId) {
      const duplicate = await SalesInvoice.findOne({ clientRequestId: data.clientRequestId }).lean();
      if (duplicate) return duplicate;
    }
    throw e;
  }
}

export async function updateSale(id: string, data: SalesInput) {
  const existing = await SalesInvoice.findById(id);
  if (!existing) throw new AppError('Sale not found', 404);

  const customer = data.customerId
    ? await Customer.findById(data.customerId)
    : null;
  if (data.customerId && !customer) throw new AppError('Customer not found', 404);
  if (data.paymentMethod === 'Credit' && !customer) {
    throw new AppError('Select a customer for credit sales', 400);
  }

  const pricedItems = [];
  let subtotal = 0;
  for (const item of data.items) {
    const product = await Product.findById(item.productId);
    if (!product) throw new AppError('Product not found', 404);
    const unit = normalizeUnit(item.unit ?? product.unit);
    const priceUnit = normalizeUnit(product.unit);
    if (!areUnitsCompatible(unit, priceUnit)) {
      throw new AppError(`Cannot sell ${product.productName} in ${unit}; its price is configured per ${priceUnit}`, 400);
    }
    if (getBaseUnit(unit) === 'pcs' && !Number.isInteger(item.quantity)) {
      throw new AppError(`${product.productName} must be sold in whole pieces`, 400);
    }
    const baseQuantity = convertToBaseQuantity(item.quantity, unit);
    const lineSubtotal = roundCurrency(
      calculateUnitPriceAmount(item.quantity, unit, product.retailPrice, priceUnit)
    );
    subtotal = roundCurrency(subtotal + lineSubtotal);
    pricedItems.push({
      productId: product._id,
      productCode: product.itemCode,
      productName: product.productName,
      quantity: item.quantity,
      unit,
      baseQuantity,
      baseUnit: getBaseUnit(unit),
      priceUnit,
      price: product.retailPrice,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      lineSubtotal,
      gstPercent: product.gstPercent,
    });
  }

  const discount = data.discount ?? 0;
  if (discount > subtotal) throw new AppError('Discount cannot exceed the subtotal', 400);

  let allocatedDiscount = 0;
  const items = pricedItems.map((item, index) => {
    const remainingDiscount = roundCurrency(Math.max(0, discount - allocatedDiscount));
    const lineDiscount = index === pricedItems.length - 1
      ? remainingDiscount
      : Math.min(remainingDiscount, roundCurrency(discount * item.lineSubtotal / (subtotal || 1)));
    allocatedDiscount = roundCurrency(allocatedDiscount + lineDiscount);
    const total = roundCurrency(item.lineSubtotal - lineDiscount);
    return {
      productId: item.productId,
      productCode: item.productCode,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
      baseQuantity: item.baseQuantity,
      baseUnit: item.baseUnit,
      priceUnit: item.priceUnit,
      price: item.price,
      retailPrice: item.retailPrice,
      wholesalePrice: item.wholesalePrice,
      discount: lineDiscount,
      gst: roundCurrency(total * item.gstPercent / 100),
      total,
    };
  });
  const gst = roundCurrency(items.reduce((sum, item) => sum + item.gst, 0));
  const grandTotal = roundCurrency(subtotal - discount + gst);
  const paidAmount = data.paymentMethod === 'Credit' ? data.paidAmount ?? 0 : grandTotal;
  if (paidAmount > grandTotal) throw new AppError('Amount received cannot exceed the invoice total', 400);
  const balanceAmount = roundCurrency(Math.max(0, grandTotal - paidAmount));

  const restoredStock: { productId: mongoose.Types.ObjectId; quantity: number }[] = [];
  const appliedStock: { productId: mongoose.Types.ObjectId; quantity: number }[] = [];
  const customerBalanceChanges: { customerId: mongoose.Types.ObjectId; amount: number }[] = [];
  try {
    if (existing.stockApplied) {
      for (const item of existing.items) {
        const product = await Product.findById(item.productId);
        if (!product) throw new AppError('Product not found while restoring sale stock', 404);
        const quantity = item.baseQuantity ?? convertToBaseQuantity(
          item.quantity,
          normalizeUnit(item.unit ?? product.unit)
        );
        await applyStockChange({
          productId: item.productId as mongoose.Types.ObjectId,
          quantityDelta: quantity,
          type: 'RETURN',
          referenceId: existing._id,
          referenceNumber: existing.invoiceNumber,
        });
        restoredStock.push({ productId: item.productId as mongoose.Types.ObjectId, quantity });
      }
    }

    for (const item of items) {
      await applyStockChange({
        productId: item.productId as mongoose.Types.ObjectId,
        quantityDelta: -item.baseQuantity,
        type: 'SALE',
        referenceId: existing._id,
        referenceNumber: existing.invoiceNumber,
      });
      appliedStock.push({ productId: item.productId as mongoose.Types.ObjectId, quantity: item.baseQuantity });
    }

    if (existing.paymentMethod === 'Credit' && existing.customerId && existing.balanceAmount > 0) {
      const update = await Customer.updateOne(
        { _id: existing.customerId },
        { $inc: { currentBalance: -existing.balanceAmount } }
      );
      if (!update.matchedCount) throw new AppError('Customer not found', 404);
      customerBalanceChanges.push({ customerId: existing.customerId as mongoose.Types.ObjectId, amount: -existing.balanceAmount });
    }
    if (data.paymentMethod === 'Credit' && customer && balanceAmount > 0) {
      const update = await Customer.updateOne(
        { _id: customer._id },
        { $inc: { currentBalance: balanceAmount } }
      );
      if (!update.matchedCount) throw new AppError('Customer not found', 404);
      customerBalanceChanges.push({ customerId: customer._id, amount: balanceAmount });
    }

    existing.customerId = customer?._id;
    existing.customerName = customer?.name || data.customerName?.trim() || 'Walk-in Customer';
    existing.customerPhone = customer?.phone || data.customerPhone?.trim() || '';
    existing.set('items', items);
    existing.subtotal = subtotal;
    existing.discount = discount;
    existing.gst = gst;
    existing.roundOff = 0;
    existing.grandTotal = grandTotal;
    existing.paidAmount = paidAmount;
    existing.balanceAmount = balanceAmount;
    existing.paymentMethod = data.paymentMethod;
    existing.stockApplied = true;
    await existing.save();
    return existing;
  } catch (error) {
    for (const change of customerBalanceChanges.reverse()) {
      try {
        await Customer.updateOne(
          { _id: change.customerId },
          { $inc: { currentBalance: -change.amount } }
        );
      } catch (rollbackError) {
        console.error('Failed to roll back customer balance after sale update error', rollbackError);
      }
    }

    for (const item of appliedStock.reverse()) {
      try {
        await applyStockChange({
          productId: item.productId,
          quantityDelta: item.quantity,
          type: 'RETURN',
          referenceId: existing._id,
          referenceNumber: existing.invoiceNumber,
        });
      } catch (rollbackError) {
        console.error('Failed to roll back updated sale stock', rollbackError);
      }
    }
    for (const item of restoredStock.reverse()) {
      try {
        await applyStockChange({
          productId: item.productId,
          quantityDelta: -item.quantity,
          type: 'SALE',
          referenceId: existing._id,
          referenceNumber: existing.invoiceNumber,
        });
      } catch (rollbackError) {
        console.error('Failed to restore original sale stock after update error', rollbackError);
      }
    }
    throw error;
  }
}

export async function deleteSale(id: string, restockStock = true) {
  const existing = await SalesInvoice.findById(id);
  if (!existing) throw new AppError('Sale not found', 404);

  const restoredStock: { productId: mongoose.Types.ObjectId; quantity: number }[] = [];
  let customerBalanceReversed = false;
  try {
    if (existing.stockApplied && restockStock) {
      for (const item of existing.items) {
        const product = await Product.findById(item.productId);
        if (!product) continue;
        const baseQuantity = item.baseQuantity ?? convertToBaseQuantity(
          item.quantity,
          normalizeUnit(item.unit ?? product.unit)
        );
        await applyStockChange({
          productId: item.productId as mongoose.Types.ObjectId,
          quantityDelta: baseQuantity,
          type: 'RETURN',
          referenceId: existing._id,
          referenceNumber: existing.invoiceNumber,
        });
        restoredStock.push({
          productId: item.productId as mongoose.Types.ObjectId,
          quantity: baseQuantity,
        });
      }
    }

    if (existing.paymentMethod === 'Credit' && existing.customerId && existing.balanceAmount > 0) {
      const update = await Customer.updateOne(
        { _id: existing.customerId },
        { $inc: { currentBalance: -existing.balanceAmount } },
      );
      if (update.matchedCount) customerBalanceReversed = true;
    }

    await existing.deleteOne();
    return { deleted: true };
  } catch (e) {
    if (customerBalanceReversed && existing.customerId) {
      try {
        await Customer.updateOne(
          { _id: existing.customerId },
          { $inc: { currentBalance: existing.balanceAmount } }
        );
      } catch (rollbackError) {
        console.error('Failed to restore customer balance after sale delete error', rollbackError);
      }
    }

    for (const item of restoredStock.reverse()) {
      try {
        await applyStockChange({
          productId: item.productId,
          quantityDelta: -item.quantity,
          type: 'SALE',
          referenceId: existing._id,
          referenceNumber: existing.invoiceNumber,
        });
      } catch (rollbackError) {
        console.error('Failed to restore stock after sale delete error', rollbackError);
      }
    }
    throw e;
  }
}

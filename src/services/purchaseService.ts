import mongoose from 'mongoose';
import { PurchaseInvoice } from '../models/PurchaseInvoice.js';
import { Product } from '../models/Product.js';
import { Supplier } from '../models/Supplier.js';
import { generateInvoiceNumber } from './invoiceNumberService.js';
import { applyStockChange } from './stockService.js';
import { AppError } from '../utils/AppError.js';
import { areUnitsCompatible, convertToBaseQuantity, getBaseUnit, normalizeUnit } from '../utils/units.js';
import type { z } from 'zod';
import type { purchaseSchema } from '../validators/purchase.js';

type PurchaseInput = z.infer<typeof purchaseSchema>;

interface AppliedPurchaseLine {
  productId: mongoose.Types.ObjectId;
  baseQuantity: number;
}

interface ProductPricingSnapshot {
  productId: mongoose.Types.ObjectId;
  purchaseCost: number;
  retailPrice: number;
  wholesalePrice: number;
  mrp: number;
}

async function rollBackPurchaseStock(
  items: AppliedPurchaseLine[],
  purchaseId: mongoose.Types.ObjectId | undefined,
  invoiceNumber: string | undefined
) {
  for (const item of items.reverse()) {
    try {
      await applyStockChange({
        productId: item.productId,
        quantityDelta: -item.baseQuantity,
        type: 'RETURN',
        referenceId: purchaseId,
        referenceNumber: invoiceNumber,
      });
    } catch (error) {
      console.error('Failed to roll back stock after purchase error', error);
    }
  }
}

async function restoreProductPricing(snapshots: ProductPricingSnapshot[]) {
  for (const snapshot of snapshots.reverse()) {
    try {
      await Product.updateOne(
        { _id: snapshot.productId },
        { $set: {
          purchaseCost: snapshot.purchaseCost,
          retailPrice: snapshot.retailPrice,
          wholesalePrice: snapshot.wholesalePrice,
          mrp: snapshot.mrp,
        } }
      );
    } catch (error) {
      console.error('Failed to restore product prices after purchase error', error);
    }
  }
}

export async function createPurchase(data: PurchaseInput, userId?: string) {
  let invoiceId: mongoose.Types.ObjectId | undefined;
  let invoiceNumberForRollback: string | undefined;
  let supplierIdForRollback: mongoose.Types.ObjectId | undefined;
  let supplierBalanceUpdated = false;
  const appliedStock: AppliedPurchaseLine[] = [];
  const pricingSnapshots: ProductPricingSnapshot[] = [];
  try {
    const items = await Promise.all(data.items.map(async (item) => {
      const product = await Product.findById(item.productId);
      if (!product) throw new AppError('Product not found for purchase item', 404);
      const unit = normalizeUnit(item.unit ?? product.unit);
      if (!areUnitsCompatible(unit, product.unit)) {
        throw new AppError(`Cannot receive ${product.productName} in ${unit}`, 400);
      }
      const baseQuantity = convertToBaseQuantity(item.quantity, unit);
      return { ...item, unit, baseQuantity, baseUnit: getBaseUnit(unit) };
    }));
    const invoiceNumber = await generateInvoiceNumber('PUR');
    const invoice = await PurchaseInvoice.create({
      ...data,
      items,
      invoiceNumber,
      supplierId: data.supplierId || undefined,
      stockApplied: false,
      createdBy: userId,
    });
    invoiceId = invoice._id;
    invoiceNumberForRollback = invoice.invoiceNumber;
    supplierIdForRollback = invoice.supplierId as mongoose.Types.ObjectId | undefined;

    if (invoice.status === 'COMPLETED' && invoice.items.length) {
      for (const item of invoice.items) {
        const productId = item.productId as mongoose.Types.ObjectId;
        const product = await Product.findById(productId);
        if (!product) throw new AppError('Product not found for purchase item', 404);
        pricingSnapshots.push({
          productId,
          purchaseCost: product.purchaseCost,
          retailPrice: product.retailPrice,
          wholesalePrice: product.wholesalePrice,
          mrp: product.mrp,
        });
        await applyStockChange({
          productId,
          quantityDelta: item.baseQuantity ?? convertToBaseQuantity(
            item.quantity,
            normalizeUnit(item.unit ?? product.unit)
          ),
          type: 'PURCHASE',
          referenceId: invoice._id,
          referenceNumber: invoice.invoiceNumber,
        });
        appliedStock.push({
          productId,
          baseQuantity: item.baseQuantity ?? convertToBaseQuantity(item.quantity, normalizeUnit(item.unit ?? product.unit)),
        });
        product.purchaseCost = item.purchaseRate;
        if (item.retailPrice !== undefined) product.retailPrice = item.retailPrice;
        if (item.wholesalePrice !== undefined) product.wholesalePrice = item.wholesalePrice;
        if (item.mrp !== undefined) product.mrp = item.mrp;
        await product.save();
      }
      invoice.stockApplied = true;
      await invoice.save();
    }

    if (invoice.supplierId && invoice.status === 'COMPLETED') {
      const update = await Supplier.updateOne(
        { _id: invoice.supplierId },
        { $inc: { currentBalance: invoice.totalAmount } }
      );
      if (!update.matchedCount) throw new AppError('Supplier not found', 404);
      supplierBalanceUpdated = true;
    }

    return invoice;
  } catch (e) {
    if (supplierBalanceUpdated && supplierIdForRollback) {
      try {
        await Supplier.updateOne(
          { _id: supplierIdForRollback },
          { $inc: { currentBalance: -data.totalAmount } }
        );
      } catch (rollbackError) {
        console.error('Failed to roll back supplier balance after purchase error', rollbackError);
      }
    }
    await rollBackPurchaseStock(appliedStock, invoiceId, invoiceNumberForRollback);
    await restoreProductPricing(pricingSnapshots);
    if (invoiceId) {
      try {
        await PurchaseInvoice.deleteOne({ _id: invoiceId });
      } catch (rollbackError) {
        console.error('Failed to remove incomplete purchase invoice', rollbackError);
      }
    }
    throw e;
  }
}

export async function updatePurchase(id: string, data: Partial<PurchaseInput>) {
  const existing = await PurchaseInvoice.findById(id);
  if (!existing) throw new AppError('Purchase not found', 404);

  if (existing.stockApplied && Object.keys(data).length > 0) {
    throw new AppError('Posted purchases cannot be changed. Delete and recreate.', 400);
  }

  const isPosting = existing.status === 'PENDING' && data.status === 'COMPLETED';
  if (isPosting && Object.keys(data).some((key) => key !== 'status')) {
    throw new AppError('Complete a pending purchase without changing its invoice details.', 400);
  }

  const previousStatus = existing.status;
  const appliedStock: AppliedPurchaseLine[] = [];
  let supplierBalanceUpdated = false;
  try {
    Object.assign(existing, data);
    await existing.save();

    if (!existing.stockApplied && existing.status === 'COMPLETED' && existing.items.length) {
      for (const item of existing.items) {
        const productId = item.productId as mongoose.Types.ObjectId;
        const product = await Product.findById(productId);
        if (!product) throw new AppError('Product not found for pending purchase item', 404);
        const baseQuantity = item.baseQuantity ?? convertToBaseQuantity(
          item.quantity,
          normalizeUnit(item.unit ?? product.unit)
        );
        await applyStockChange({
          productId,
          quantityDelta: baseQuantity,
          type: 'PURCHASE',
          referenceId: existing._id,
          referenceNumber: existing.invoiceNumber,
        });
        appliedStock.push({ productId, baseQuantity });
      }
      if (existing.supplierId) {
        const update = await Supplier.updateOne(
          { _id: existing.supplierId },
          { $inc: { currentBalance: existing.totalAmount } },
        );
        if (!update.matchedCount) throw new AppError('Supplier not found', 404);
        supplierBalanceUpdated = true;
      }
      existing.stockApplied = true;
      await existing.save();
    }

    return existing;
  } catch (e) {
    if (supplierBalanceUpdated && existing.supplierId) {
      try {
        await Supplier.updateOne(
          { _id: existing.supplierId },
          { $inc: { currentBalance: -existing.totalAmount } }
        );
      } catch (rollbackError) {
        console.error('Failed to roll back supplier balance after purchase completion error', rollbackError);
      }
    }
    await rollBackPurchaseStock(appliedStock, existing._id, existing.invoiceNumber);
    if (isPosting) {
      try {
        await PurchaseInvoice.updateOne(
          { _id: existing._id },
          { $set: { status: previousStatus, stockApplied: false } }
        );
      } catch (rollbackError) {
        console.error('Failed to restore pending purchase status', rollbackError);
      }
    }
    throw e;
  }
}

export async function deletePurchase(id: string) {
  const existing = await PurchaseInvoice.findById(id);
  if (!existing) throw new AppError('Purchase not found', 404);

  const removedStock: AppliedPurchaseLine[] = [];
  let supplierBalanceReversed = false;
  try {
    if (existing.stockApplied) {
      for (const item of existing.items) {
        const productId = item.productId as mongoose.Types.ObjectId;
        const product = await Product.findById(productId);
        if (!product) throw new AppError('Product not found while deleting purchase', 404);
        const baseQuantity = item.baseQuantity ?? convertToBaseQuantity(
          item.quantity,
          normalizeUnit(item.unit ?? product.unit)
        );
        await applyStockChange({
          productId,
          quantityDelta: -baseQuantity,
          type: 'RETURN',
          referenceId: existing._id,
          referenceNumber: existing.invoiceNumber,
        });
        removedStock.push({ productId, baseQuantity });
      }
    }

    if (existing.status === 'COMPLETED' && existing.supplierId) {
      const update = await Supplier.updateOne(
        { _id: existing.supplierId },
        { $inc: { currentBalance: -existing.totalAmount } }
      );
      if (!update.matchedCount) throw new AppError('Supplier not found', 404);
      supplierBalanceReversed = true;
    }

    await existing.deleteOne();
    return { deleted: true };
  } catch (e) {
    if (supplierBalanceReversed && existing.supplierId) {
      try {
        await Supplier.updateOne(
          { _id: existing.supplierId },
          { $inc: { currentBalance: existing.totalAmount } }
        );
      } catch (rollbackError) {
        console.error('Failed to restore supplier balance after purchase delete error', rollbackError);
      }
    }
    for (const item of removedStock.reverse()) {
      try {
        await applyStockChange({
          productId: item.productId,
          quantityDelta: item.baseQuantity,
          type: 'PURCHASE',
          referenceId: existing._id,
          referenceNumber: existing.invoiceNumber,
        });
      } catch (rollbackError) {
        console.error('Failed to restore stock after purchase delete error', rollbackError);
      }
    }
    throw e;
  }
}

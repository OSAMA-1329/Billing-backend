import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { StockMovement } from '../models/StockMovement.js';
import { AppError } from '../utils/AppError.js';
import { convertFromBaseQuantity, convertToBaseQuantity, getBaseUnit } from '../utils/units.js';

type MovementType = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'RETURN';

export async function applyStockChange(
  params: {
    productId: mongoose.Types.ObjectId;
    quantityDelta: number;
    type: MovementType;
    referenceId?: mongoose.Types.ObjectId;
    referenceNumber?: string;
  }
): Promise<void> {
  let currentProduct = await Product.findById(params.productId);
  if (!currentProduct) throw new AppError('Product not found for stock update', 404);

  if (currentProduct.stockBaseQuantity == null) {
    const legacyBaseQuantity = convertToBaseQuantity(currentProduct.availableStock, currentProduct.unit);
    await Product.updateOne(
      { _id: currentProduct._id, stockBaseQuantity: { $exists: false } },
      { $set: { stockBaseQuantity: legacyBaseQuantity } }
    );
    currentProduct = await Product.findById(params.productId);
    if (!currentProduct) throw new AppError('Product not found for stock update', 404);
  }

  const displayDelta = convertFromBaseQuantity(params.quantityDelta, currentProduct.unit);
  const stockFilter = params.quantityDelta < 0
    ? { _id: params.productId, stockBaseQuantity: { $gte: Math.abs(params.quantityDelta) } }
    : { _id: params.productId };
  const product = await Product.findOneAndUpdate(
    stockFilter,
    { $inc: { stockBaseQuantity: params.quantityDelta, availableStock: displayDelta } },
    { new: false }
  ).select('productName unit availableStock stockBaseQuantity').lean();

  if (!product) {
    throw new AppError(`Insufficient stock for ${currentProduct.productName}`, 400);
  }

  const previousStock = product.availableStock;
  const previousBaseStock = product.stockBaseQuantity ?? 0;
  const newStock = previousStock + displayDelta;
  const newBaseStock = previousBaseStock + params.quantityDelta;

  try {
    await StockMovement.create({
      productId: params.productId,
      type: params.type,
      quantity: Math.abs(displayDelta),
      unit: product.unit,
      baseQuantity: Math.abs(params.quantityDelta),
      baseUnit: getBaseUnit(product.unit),
      referenceId: params.referenceId,
      referenceNumber: params.referenceNumber,
      previousStock,
      newStock,
      previousBaseStock,
      newBaseStock,
    });
  } catch (error) {
    const rollbackFilter = params.quantityDelta > 0
      ? { _id: params.productId, stockBaseQuantity: { $gte: params.quantityDelta } }
      : { _id: params.productId };
    try {
      await Product.updateOne(rollbackFilter, {
        $inc: { stockBaseQuantity: -params.quantityDelta, availableStock: -displayDelta },
      });
    } catch (rollbackError) {
      console.error('Failed to roll back stock after movement insert error', rollbackError);
    }
    throw error;
  }
}

export async function reversePurchaseStock(
  purchaseId: mongoose.Types.ObjectId,
  items: { productId: mongoose.Types.ObjectId; quantity: number }[],
  invoiceNumber: string
): Promise<void> {
  for (const item of items) {
    await applyStockChange({
      productId: item.productId,
      quantityDelta: -item.quantity,
      type: 'RETURN',
      referenceId: purchaseId,
      referenceNumber: invoiceNumber,
    });
  }
}

export async function reverseSaleStock(
  saleId: mongoose.Types.ObjectId,
  items: { productId: mongoose.Types.ObjectId; quantity: number }[],
  invoiceNumber: string
): Promise<void> {
  for (const item of items) {
    await applyStockChange({
      productId: item.productId,
      quantityDelta: item.quantity,
      type: 'RETURN',
      referenceId: saleId,
      referenceNumber: invoiceNumber,
    });
  }
}

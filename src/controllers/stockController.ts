import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { Product } from '../models/Product.js';
import { StockMovement } from '../models/StockMovement.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { getPagination } from '../utils/pagination.js';
import { applyStockChange } from '../services/stockService.js';
import { areUnitsCompatible, convertToBaseQuantity, normalizeUnit } from '../utils/units.js';

export async function listStock(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const search = (req.query.search as string)?.trim();
    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { itemCode: { $regex: search, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      Product.find(filter)
        .select('itemCode productName unit availableStock purchaseCost retailPrice godownLocation')
        .sort({ productName: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

export async function listMovements(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const productId = req.query.productId as string | undefined;
    const filter: Record<string, unknown> = {};
    if (productId) filter.productId = productId;
    const [items, total] = await Promise.all([
      StockMovement.find(filter)
        .populate('productId', 'itemCode productName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StockMovement.countDocuments(filter),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

export async function adjustStock(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId, quantity, unit: requestedUnit, note } = req.body as {
      productId: string;
      quantity: number;
      unit?: string;
      note?: string;
    };
    if (!productId || quantity === 0) throw new AppError('Invalid adjustment', 400);
    const existingProduct = await Product.findById(productId);
    if (!existingProduct) throw new AppError('Product not found', 404);
    const unit = normalizeUnit(requestedUnit ?? existingProduct.unit);
    if (!areUnitsCompatible(unit, existingProduct.unit)) {
      throw new AppError(`Cannot adjust ${existingProduct.productName} in ${unit}`, 400);
    }
    await applyStockChange({
      productId: new mongoose.Types.ObjectId(productId),
      quantityDelta: convertToBaseQuantity(quantity, unit),
      type: 'ADJUSTMENT',
      referenceNumber: note || 'MANUAL',
    });
    const product = await Product.findById(productId).lean();
    sendSuccess(res, product);
  } catch (e) {
    next(e);
  }
}

export async function exportStock(req: Request, res: Response, next: NextFunction) {
  try {
    const products = await Product.find().sort({ productName: 1 }).lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Stock');
    sheet.columns = [
      { header: 'Code', key: 'itemCode', width: 12 },
      { header: 'Product', key: 'productName', width: 30 },
      { header: 'Stock', key: 'availableStock', width: 10 },
      { header: 'Value', key: 'value', width: 12 },
    ];
    products.forEach((p) =>
      sheet.addRow({ ...p, value: (p.availableStock || 0) * (p.purchaseCost || 0) })
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=stock.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
}

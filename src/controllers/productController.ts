import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { Product } from '../models/Product.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { getPagination } from '../utils/pagination.js';
import { StockMovement } from '../models/StockMovement.js';
import {
  areUnitsCompatible,
  convertFromBaseQuantity,
  convertToBaseQuantity,
  getBaseUnit,
  normalizeUnit,
} from '../utils/units.js';

export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const search = (req.query.search as string)?.trim();
    const barcode = (req.query.barcode as string)?.trim();
    const filter: Record<string, unknown> = {};

    if (barcode) {
      filter.barcode = barcode;
    } else if (search) {
      filter.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { itemCode: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      Product.find(filter).sort({ productName: 1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);

    sendSuccess(res, { items, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (e) {
    next(e);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw new AppError('Product not found', 404);
    sendSuccess(res, product);
  } catch (e) {
    next(e);
  }
}

export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { openingStock, ...rest } = req.body;
    const stock = openingStock ?? 0;
    const unit = normalizeUnit(rest.unit ?? 'Pcs');
    const baseStock = convertToBaseQuantity(stock, unit);
    const product = await Product.create({
      ...rest,
      unit,
      availableStock: stock,
      stockBaseQuantity: baseStock,
    });

    if (baseStock > 0) {
      await StockMovement.create({
        productId: product._id,
        type: 'ADJUSTMENT',
        quantity: stock,
        unit,
        baseQuantity: baseStock,
        baseUnit: getBaseUnit(unit),
        referenceNumber: 'OPENING',
        previousStock: 0,
        newStock: stock,
        previousBaseStock: 0,
        newBaseStock: baseStock,
      });
    }

    sendSuccess(res, product, 201);
  } catch (e) {
    next(e);
  }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw new AppError('Product not found', 404);
    const oldUnit = normalizeUnit(product.unit);
    const baseStock = product.stockBaseQuantity
      ?? convertToBaseQuantity(product.availableStock, oldUnit);
    const nextUnit = req.body.unit ? normalizeUnit(req.body.unit) : oldUnit;
    if (baseStock > 0 && !areUnitsCompatible(oldUnit, nextUnit)) {
      throw new AppError('Cannot change a stocked product to an incompatible unit. Adjust stock to zero first.', 400);
    }

    Object.assign(product, req.body);
    product.unit = nextUnit;
    product.stockBaseQuantity = baseStock;
    product.availableStock = convertFromBaseQuantity(baseStock, nextUnit);
    await product.save();
    sendSuccess(res, product);
  } catch (e) {
    next(e);
  }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) throw new AppError('Product not found', 404);
    sendSuccess(res, { deleted: true });
  } catch (e) {
    next(e);
  }
}

export async function bulkDeleteProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const ids = (req.body.ids as string[]) || [];
    if (!ids.length) throw new AppError('No products selected', 400);
    await Product.deleteMany({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } });
    sendSuccess(res, { deletedCount: ids.length });
  } catch (e) {
    next(e);
  }
}

export async function exportProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const products = await Product.find().sort({ productName: 1 }).lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.columns = [
      { header: 'Item Code', key: 'itemCode', width: 14 },
      { header: 'Product Name', key: 'productName', width: 30 },
      { header: 'Tamil Name', key: 'tamilProductName', width: 20 },
      { header: 'Unit', key: 'unit', width: 8 },
      { header: 'MRP', key: 'mrp', width: 10 },
      { header: 'Purchase Cost', key: 'purchaseCost', width: 12 },
      { header: 'Retail', key: 'retailPrice', width: 10 },
      { header: 'Stock', key: 'availableStock', width: 10 },
    ];
    products.forEach((p) => sheet.addRow(p));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=products.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
}

import type { Request, Response, NextFunction } from 'express';
import { Supplier } from '../models/Supplier.js';
import { PurchaseInvoice } from '../models/PurchaseInvoice.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { getPagination } from '../utils/pagination.js';

export async function listSuppliers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const search = (req.query.search as string)?.trim();
    const filter = search ? { name: { $regex: search, $options: 'i' } } : {};
    const [items, total] = await Promise.all([
      Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      Supplier.countDocuments(filter),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

export async function getSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const supplier = await Supplier.findById(req.params.id).lean();
    if (!supplier) throw new AppError('Supplier not found', 404);
    sendSuccess(res, supplier);
  } catch (e) {
    next(e);
  }
}

export async function createSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const opening = req.body.openingBalance ?? 0;
    const supplier = await Supplier.create({
      ...req.body,
      currentBalance: opening,
    });
    sendSuccess(res, supplier, 201);
  } catch (e) {
    next(e);
  }
}

export async function updateSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!supplier) throw new AppError('Supplier not found', 404);
    sendSuccess(res, supplier);
  } catch (e) {
    next(e);
  }
}

export async function deleteSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) throw new AppError('Supplier not found', 404);
    sendSuccess(res, { deleted: true });
  } catch (e) {
    next(e);
  }
}

export async function supplierPurchaseHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const filter = { supplierId: req.params.id };
    const [items, total] = await Promise.all([
      PurchaseInvoice.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(limit).lean(),
      PurchaseInvoice.countDocuments(filter),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

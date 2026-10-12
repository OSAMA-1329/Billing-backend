import type { Request, Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { PurchaseInvoice } from '../models/PurchaseInvoice.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { getPagination } from '../utils/pagination.js';
import * as purchaseService from '../services/purchaseService.js';

function getPurchaseId(req: Request): string {
  const param = req.params.id;
  const id = Array.isArray(param) ? param[0] : param;
  if (!id) throw new AppError('Invalid purchase id', 400);
  return id;
}

export async function listPurchases(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const search = (req.query.search as string)?.trim();
    const status = req.query.status as string | undefined;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
        { externalInvoiceNumber: { $regex: search, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      PurchaseInvoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PurchaseInvoice.countDocuments(filter),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

export async function getPurchase(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await PurchaseInvoice.findById(req.params.id).lean();
    if (!doc) throw new AppError('Purchase not found', 404);
    sendSuccess(res, doc);
  } catch (e) {
    next(e);
  }
}

export async function createPurchase(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await purchaseService.createPurchase(req.body, req.user?.id);
    sendSuccess(res, invoice, 201);
  } catch (e) {
    next(e);
  }
}

export async function updatePurchase(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await purchaseService.updatePurchase(getPurchaseId(req), req.body);
    sendSuccess(res, invoice);
  } catch (e) {
    next(e);
  }
}

export async function deletePurchase(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await purchaseService.deletePurchase(getPurchaseId(req));
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
}

export async function exportPurchases(req: Request, res: Response, next: NextFunction) {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const filter: Record<string, unknown> = {};
    if (from || to) {
      filter.invoiceDate = {};
      if (from) (filter.invoiceDate as Record<string, Date>).$gte = from;
      if (to) (filter.invoiceDate as Record<string, Date>).$lte = to;
    }
    const items = await PurchaseInvoice.find(filter).sort({ invoiceDate: -1 }).lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Purchases');
    sheet.columns = [
      { header: 'Invoice', key: 'invoiceNumber', width: 18 },
      { header: 'Supplier', key: 'supplierName', width: 24 },
      { header: 'Date', key: 'invoiceDate', width: 14 },
      { header: 'Total', key: 'totalAmount', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    items.forEach((p) => sheet.addRow(p));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=purchases.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
}

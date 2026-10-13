import type { Request, Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { SalesInvoice } from '../models/SalesInvoice.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { getPagination } from '../utils/pagination.js';
import * as salesService from '../services/salesService.js';

export async function listSales(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const search = (req.query.search as string)?.trim();
    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      SalesInvoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SalesInvoice.countDocuments(filter),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

// export async function getSale(req: Request, res: Response, next: NextFunction) {
//   try {
//     const identifier = req.params.id.trim();
//     let query;
//     if (mongoose.isValidObjectId(identifier)) {
//       query = SalesInvoice.findById(identifier);
//     } else if (/^[A-Za-z0-9][A-Za-z0-9/_-]{0,63}$/.test(identifier)) {
//       query = SalesInvoice.findOne({ invoiceNumber: identifier });
//     } else {
//       throw new AppError('Invalid sale identifier', 400);
//     }
//     const doc = await query
//       .populate('customerId', 'name phone address gstNumber')
//       .populate('createdBy', 'name email role')
//       .lean();
//     if (!doc) throw new AppError('Sale not found', 404);
//     sendSuccess(res, doc);
//   } catch (e) {
//     next(e);
//   }
// }

export async function getSale(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const rawId = req.params.id;

    // Validate that the identifier is a single string.
    if (typeof rawId !== "string") {
      throw new AppError("Invalid sale identifier", 400);
    }

    const identifier = rawId.trim();

    if (!identifier) {
      throw new AppError("Sale identifier is required", 400);
    }

    let query;

    if (mongoose.isValidObjectId(identifier)) {
      query = SalesInvoice.findById(identifier);
    } else if (
      /^[A-Za-z0-9][A-Za-z0-9/_-]{0,63}$/.test(identifier)
    ) {
      query = SalesInvoice.findOne({
        invoiceNumber: identifier,
      });
    } else {
      throw new AppError("Invalid sale identifier", 400);
    }

    const doc = await query
      .populate("customerId", "name phone address gstNumber")
      .populate("createdBy", "name email role")
      .lean();

    if (!doc) {
      throw new AppError("Sale not found", 404);
    }

    sendSuccess(res, doc);
  } catch (e) {
    next(e);
  }
}


export async function createSale(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await salesService.createSale(req.body, req.user?.id);
    console.log('Sale created:', req.body,);
    sendSuccess(res, invoice, 201);
  } catch (e) {
    console.log('Error creating sale:', e);
    next(e);
  }
}

export async function updateSale(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await SalesInvoice.findById(req.params.id);
    if (!existing) throw new AppError('Sale not found', 404);
    if (existing.stockApplied) {
      throw new AppError('Posted sales cannot be edited. Void and re-create.', 400);
    }
    Object.assign(existing, req.body);
    await existing.save();
    sendSuccess(res, existing);
  } catch (e) {
    next(e);
  }
}

export async function deleteSale(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await salesService.deleteSale(String(req.params.id));
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
}

export async function exportSales(req: Request, res: Response, next: NextFunction) {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const filter: Record<string, unknown> = {};
    if (from || to) {
      filter.createdAt = {};
      if (from) (filter.createdAt as Record<string, Date>).$gte = from;
      if (to) (filter.createdAt as Record<string, Date>).$lte = to;
    }
    const items = await SalesInvoice.find(filter).sort({ createdAt: -1 }).lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sales');
    sheet.columns = [
      { header: 'Invoice', key: 'invoiceNumber', width: 18 },
      { header: 'Customer', key: 'customerName', width: 24 },
      { header: 'Total', key: 'grandTotal', width: 12 },
      { header: 'Payment', key: 'paymentMethod', width: 10 },
    ];
    items.forEach((s) => sheet.addRow(s));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
}

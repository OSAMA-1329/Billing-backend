import type { Request, Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { SalesInvoice } from '../models/SalesInvoice.js';
import { PurchaseInvoice } from '../models/PurchaseInvoice.js';
import { Product } from '../models/Product.js';
import { Customer } from '../models/Customer.js';
import { Supplier } from '../models/Supplier.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';

function dateRange(req: Request) {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const range: Record<string, Date> = {};
  if (from) range.$gte = from;
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? range : undefined;
}

export async function salesReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const createdAt = dateRange(req);
    const search = (req.query.search as string)?.trim();
    const filter: Record<string, unknown> = {};
    if (createdAt) filter.createdAt = createdAt;
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
      ];
    }
    const [items, total, summary] = await Promise.all([
      SalesInvoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SalesInvoice.countDocuments(filter),
      SalesInvoice.aggregate([
        { $match: filter },
        { $group: { _id: null, grandTotal: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      ]),
    ]);
    sendSuccess(res, {
      items,
      total,
      page,
      limit,
      summary: summary[0] || { grandTotal: 0, count: 0 },
    });
  } catch (e) {
    next(e);
  }
}

export async function purchaseReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const invoiceDate = dateRange(req);
    const filter: Record<string, unknown> = { status: 'COMPLETED' };
    if (invoiceDate) filter.invoiceDate = invoiceDate;
    const [items, total, summary] = await Promise.all([
      PurchaseInvoice.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(limit).lean(),
      PurchaseInvoice.countDocuments(filter),
      PurchaseInvoice.aggregate([
        { $match: filter },
        { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
    ]);
    sendSuccess(res, {
      items,
      total,
      page,
      limit,
      summary: summary[0] || { totalAmount: 0, count: 0 },
    });
  } catch (e) {
    next(e);
  }
}

export async function stockReport(req: Request, res: Response, next: NextFunction) {
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
    const [items, total, summary] = await Promise.all([
      Product.find(filter).sort({ productName: 1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
      Product.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            stockValue: { $sum: { $multiply: ['$availableStock', '$purchaseCost'] } },
            units: { $sum: '$availableStock' },
          },
        },
      ]),
    ]);
    sendSuccess(res, {
      items,
      total,
      page,
      limit,
      summary: summary[0] || { stockValue: 0, units: 0 },
    });
  } catch (e) {
    next(e);
  }
}

export async function profitReport(req: Request, res: Response, next: NextFunction) {
  try {
    const createdAt = dateRange(req);
    const match: Record<string, unknown> = {};
    if (createdAt) match.createdAt = createdAt;

    const unitFactor = (unit: unknown) => ({
      $switch: {
        branches: [
          { case: { $in: [unit, ['Kg', 'kg']] }, then: 1000 },
          { case: { $in: [unit, ['L', 'l']] }, then: 1000 },
        ],
        default: 1,
      },
    });

    const rows = await SalesInvoice.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.productName' },
          revenue: { $sum: '$items.total' },
          cost: {
            $sum: {
              $multiply: [
                {
                  $divide: [
                    {
                      $ifNull: [
                        '$items.baseQuantity',
                        {
                          $multiply: [
                            '$items.quantity',
                            unitFactor({ $ifNull: ['$items.unit', '$product.unit'] }),
                          ],
                        },
                      ],
                    },
                    unitFactor('$product.unit'),
                  ],
                },
                '$product.purchaseCost',
              ],
            },
          },
          qty: {
            $sum: {
              $divide: [
                {
                  $ifNull: [
                    '$items.baseQuantity',
                    {
                      $multiply: [
                        '$items.quantity',
                        unitFactor({ $ifNull: ['$items.unit', '$product.unit'] }),
                      ],
                    },
                  ],
                },
                unitFactor('$product.unit'),
              ],
            },
          },
        },
      },
      {
        $project: {
          productName: 1,
          revenue: 1,
          cost: 1,
          qty: 1,
          profit: { $subtract: ['$revenue', '$cost'] },
        },
      },
      { $sort: { profit: -1 } },
    ]);

    const summary = rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        cost: acc.cost + r.cost,
        profit: acc.profit + r.profit,
      }),
      { revenue: 0, cost: 0, profit: 0 }
    );

    sendSuccess(res, { items: rows, summary });
  } catch (e) {
    next(e);
  }
}

export async function customerOutstandingReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const search = (req.query.search as string)?.trim();
    const filter: Record<string, unknown> = { currentBalance: { $gt: 0 } };
    if (search) filter.name = { $regex: search, $options: 'i' };
    const [items, total] = await Promise.all([
      Customer.find(filter).sort({ currentBalance: -1 }).skip(skip).limit(limit).lean(),
      Customer.countDocuments(filter),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

export async function supplierOutstandingReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const search = (req.query.search as string)?.trim();
    const filter: Record<string, unknown> = { currentBalance: { $gt: 0 } };
    if (search) filter.name = { $regex: search, $options: 'i' };
    const [items, total] = await Promise.all([
      Supplier.find(filter).sort({ currentBalance: -1 }).skip(skip).limit(limit).lean(),
      Supplier.countDocuments(filter),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

export async function exportReport(req: Request, res: Response, next: NextFunction) {
  try {
    const type = req.params.type;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');

    if (type === 'sales') {
      sheet.columns = [
        { header: 'Invoice', key: 'invoiceNumber', width: 18 },
        { header: 'Customer', key: 'customerName', width: 24 },
        { header: 'Total', key: 'grandTotal', width: 12 },
      ];
      const createdAt = dateRange(req);
      const filter = createdAt ? { createdAt } : {};
      const items = await SalesInvoice.find(filter).lean();
      items.forEach((i) => sheet.addRow(i));
    } else if (type === 'stock') {
      sheet.columns = [
        { header: 'Code', key: 'itemCode', width: 12 },
        { header: 'Product', key: 'productName', width: 30 },
        { header: 'Stock', key: 'availableStock', width: 10 },
      ];
      const items = await Product.find().lean();
      items.forEach((i) => sheet.addRow(i));
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${type}-report.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
}

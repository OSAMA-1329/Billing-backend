import type { Request, Response, NextFunction } from 'express';
import { SalesInvoice } from '../models/SalesInvoice.js';
import { PurchaseInvoice } from '../models/PurchaseInvoice.js';
import { Product } from '../models/Product.js';
import { Customer } from '../models/Customer.js';
import { Supplier } from '../models/Supplier.js';
import { sendSuccess } from '../utils/apiResponse.js';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number) {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const today = startOfToday();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const sevenDaysAgo = daysAgo(6);

    const [
      todaySalesAgg,
      todayPurchasesAgg,
      todayBills,
      totalProducts,
      lowStockProducts,
      customerOutstanding,
      supplierOutstanding,
      salesTrend,
      purchaseTrend,
      topProducts,
    ] = await Promise.all([
      SalesInvoice.aggregate([
        { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      ]),
      PurchaseInvoice.aggregate([
        { $match: { invoiceDate: { $gte: today, $lt: tomorrow }, status: 'COMPLETED' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      SalesInvoice.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
      Product.countDocuments(),
      Product.countDocuments({ $expr: { $lte: ['$availableStock', '$lowStockThreshold'] } }),
      Customer.aggregate([{ $group: { _id: null, total: { $sum: '$currentBalance' } } }]),
      Supplier.aggregate([{ $group: { _id: null, total: { $sum: '$currentBalance' } } }]),
      SalesInvoice.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: '$grandTotal' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      PurchaseInvoice.aggregate([
        { $match: { invoiceDate: { $gte: sevenDaysAgo }, status: 'COMPLETED' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } },
            total: { $sum: '$totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      SalesInvoice.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.productName' },
            qty: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.total' },
          },
        },
        { $sort: { qty: -1 } },
        { $limit: 5 },
      ]),
    ]);

    sendSuccess(res, {
      todaySales: todaySalesAgg[0]?.total || 0,
      todaySalesCount: todaySalesAgg[0]?.count || 0,
      todayPurchases: todayPurchasesAgg[0]?.total || 0,
      todayPurchasesCount: todayPurchasesAgg[0]?.count || 0,
      todayBills,
      totalProducts,
      lowStockProducts,
      customerOutstanding: customerOutstanding[0]?.total || 0,
      supplierOutstanding: supplierOutstanding[0]?.total || 0,
      salesTrend,
      purchaseTrend,
      topProducts,
    });
  } catch (e) {
    next(e);
  }
}

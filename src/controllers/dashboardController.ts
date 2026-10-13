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
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const unitFactor = (unit: unknown) => ({
      $switch: {
        branches: [
          { case: { $in: [unit, ['Kg', 'kg']] }, then: 1000 },
          { case: { $in: [unit, ['L', 'l']] }, then: 1000 },
        ],
        default: 1,
      },
    });

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
      monthProfitAgg,
    ] = await Promise.all([
      SalesInvoice.aggregate([
        { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
        {
          $group: {
            _id: null,
            total: { $sum: '$grandTotal' },
            count: { $sum: 1 },
            cashSales: {
              $sum: { $cond: [{ $eq: ['$paymentMethod', 'Cash'] }, '$paidAmount', 0] },
            },
            upiSales: {
              $sum: { $cond: [{ $eq: ['$paymentMethod', 'UPI'] }, '$paidAmount', 0] },
            },
            creditDue: {
              $sum: { $cond: [{ $eq: ['$paymentMethod', 'Credit'] }, '$balanceAmount', 0] },
            },
          },
        },
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
      SalesInvoice.aggregate([
        { $match: { createdAt: { $gte: monthStart, $lt: tomorrow } } },
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
            _id: null,
            retailProfit: {
              $sum: {
                $subtract: [
                  '$items.total',
                  {
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
                          unitFactor({ $ifNull: ['$items.priceUnit', '$product.unit'] }),
                        ],
                      },
                      '$product.purchaseCost',
                    ],
                  },
                ],
              },
            },
            wholesaleProfit: {
              $sum: {
                $subtract: [
                  {
                    $multiply: [
                      { $ifNull: ['$items.wholesalePrice', '$product.wholesalePrice'] },
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
                          unitFactor({ $ifNull: ['$items.priceUnit', '$product.unit'] }),
                        ],
                      },
                    ],
                  },
                  {
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
                          unitFactor({ $ifNull: ['$items.priceUnit', '$product.unit'] }),
                        ],
                      },
                      '$product.purchaseCost',
                    ],
                  },
                ],
              },
            },
          },
        },
      ]),
    ]);

    sendSuccess(res, {
      todaySales: todaySalesAgg[0]?.total || 0,
      todaySalesCount: todaySalesAgg[0]?.count || 0,
      todayCashSales: todaySalesAgg[0]?.cashSales || 0,
      todayUpiSales: todaySalesAgg[0]?.upiSales || 0,
      todayCredit: todaySalesAgg[0]?.creditDue || 0,
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
      monthRetailProfit: monthProfitAgg[0]?.retailProfit || 0,
      monthWholesaleProfit: monthProfitAgg[0]?.wholesaleProfit || 0,
    });
  } catch (e) {
    next(e);
  }
}

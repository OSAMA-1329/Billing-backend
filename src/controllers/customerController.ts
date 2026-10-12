import type { Request, Response, NextFunction } from 'express';
import { Customer } from '../models/Customer.js';
import { SalesInvoice } from '../models/SalesInvoice.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { getPagination } from '../utils/pagination.js';

export async function listCustomers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const search = (req.query.search as string)?.trim();
    const filter = search ? { name: { $regex: search, $options: 'i' } } : {};
    const [items, total] = await Promise.all([
      Customer.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      Customer.countDocuments(filter),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

export async function getCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) throw new AppError('Customer not found', 404);
    sendSuccess(res, customer);
  } catch (e) {
    next(e);
  }
}

export async function createCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const opening = req.body.openingBalance ?? 0;
    const customer = await Customer.create({
      ...req.body,
      currentBalance: opening,
    });
    sendSuccess(res, customer, 201);
  } catch (e) {
    next(e);
  }
}

export async function updateCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!customer) throw new AppError('Customer not found', 404);
    sendSuccess(res, customer);
  } catch (e) {
    next(e);
  }
}

export async function deleteCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) throw new AppError('Customer not found', 404);
    sendSuccess(res, { deleted: true });
  } catch (e) {
    next(e);
  }
}

export async function customerSalesHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const filter = { customerId: req.params.id };
    const [items, total] = await Promise.all([
      SalesInvoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SalesInvoice.countDocuments(filter),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

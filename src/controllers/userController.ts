import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { getPagination } from '../utils/pagination.js';

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const [items, total] = await Promise.all([
      User.find().select('-password').sort({ name: 1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(),
    ]);
    sendSuccess(res, { items, total, page, limit });
  } catch (e) {
    next(e);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { password, ...rest } = req.body as { password?: string; role?: string; isActive?: boolean; name?: string };
    const update: Record<string, unknown> = { ...rest };
    if (password) {
      update.password = await bcrypt.hash(password, 10);
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).select('-password');
    if (!user) throw new AppError('User not found', 404);
    sendSuccess(res, user);
  } catch (e) {
    next(e);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.params.id === req.user?.id) {
      throw new AppError('Cannot delete your own account', 400);
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    sendSuccess(res, { deleted: true });
  } catch (e) {
    next(e);
  }
}

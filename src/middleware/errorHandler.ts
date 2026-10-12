import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { sendError } from '../utils/apiResponse.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode);
  }
  if (err instanceof ZodError) {
    const message = err.errors.map((e) => e.message).join(', ');
    return sendError(res, message, 400);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return sendError(res, err.message, 400);
  }
  if ((err as { code?: number }).code === 11000) {
    return sendError(res, 'Duplicate record', 409);
  }
  console.error(err);
  return sendError(res, 'Internal server error', 500);
}

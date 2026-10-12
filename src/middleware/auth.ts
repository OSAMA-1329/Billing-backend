import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { sendError } from '../utils/apiResponse.js';
import type { Role } from '../types/roles.js';

interface JwtPayload {
  sub: string;
  role: Role;
  name: string;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return sendError(res, 'Unauthorized', 401);
  }
  const token = header.slice(7);
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return sendError(res, 'Server misconfiguration', 500);
    }
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.user = { id: payload.sub, role: payload.role, name: payload.name };
    next();
  } catch {
    return sendError(res, 'Invalid or expired token', 401);
  }
}

export function authorize(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401);
    }
    if (!allowed.includes(req.user.role)) {
      return sendError(res, 'Forbidden', 403);
    }
    next();
  };
}

import type { Role } from './roles.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        name: string;
      };
    }
  }
}

export {};

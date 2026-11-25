import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../utils/errors';
import { Role } from '../models/user.model';

export interface AuthUser {
  id: string;
  schoolId: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface AccessPayload {
  sub: string;
  schoolId: string;
  role: Role;
  typ: 'access';
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AccessPayload;
    if (payload.typ !== 'access') return next(unauthorized('Invalid token'));
    req.user = { id: payload.sub, schoolId: payload.schoolId, role: payload.role };
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Returns the authenticated user or throws (for use inside controllers). */
export function currentUser(req: Express.Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

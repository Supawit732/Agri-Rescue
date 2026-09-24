import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../http/errors';
import '../types/express';
import type { UserRole } from '../types/express';

function isUserRole(value: unknown): value is UserRole {
  return value === 'farmer' || value === 'buyer' || value === 'driver' || value === 'coordinator';
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret === undefined || secret.trim() === '') {
    throw new HttpError(500, 'INTERNAL', 'ระบบยังไม่ได้ตั้งค่าความลับของโทเคน');
  }
  return secret;
}

/**
 * If Authorization Bearer is present, verify and set req.auth.
 * If absent, continue as anonymous. Invalid token → 401.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (header === undefined || !header.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  if (token === '') {
    next();
    return;
  }
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload === 'string') {
      next(new HttpError(401, 'UNAUTHORIZED', 'โทเคนไม่ถูกต้องหรือหมดอายุ'));
      return;
    }
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || !isUserRole(payload.role)) {
      next(new HttpError(401, 'UNAUTHORIZED', 'โทเคนไม่ถูกต้องหรือหมดอายุ'));
      return;
    }
    req.auth = {
      id,
      role: payload.role,
      can_sell: asBool(payload.can_sell),
      can_buy: asBool(payload.can_buy),
      is_admin: asBool(payload.is_admin),
    };
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHORIZED', 'โทเคนไม่ถูกต้องหรือหมดอายุ'));
  }
}

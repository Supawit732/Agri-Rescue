import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../http/errors';
import '../types/express';
import type { Capability, UserRole } from '../types/express';

export const JWT_EXPIRES_IN = '7d';

export interface TokenCapabilities {
  can_sell: boolean;
  can_buy: boolean;
  is_admin: boolean;
}

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

export function signAccessToken(
  userId: number,
  role: UserRole,
  capabilities: TokenCapabilities,
): string {
  return jwt.sign(
    {
      sub: userId,
      role,
      can_sell: capabilities.can_sell,
      can_buy: capabilities.can_buy,
      is_admin: capabilities.is_admin,
    },
    jwtSecret(),
    { expiresIn: JWT_EXPIRES_IN },
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (header === undefined || !header.startsWith('Bearer ')) {
    next(new HttpError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
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

export function requireCapability(...capabilities: Capability[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.auth === undefined) {
      next(new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึง'));
      return;
    }
    const ok = capabilities.some((cap) => {
      if (cap === 'sell') {
        return req.auth?.can_sell === true;
      }
      if (cap === 'buy') {
        return req.auth?.can_buy === true;
      }
      return req.auth?.is_admin === true;
    });
    if (!ok) {
      next(new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึง'));
      return;
    }
    next();
  };
}

/** @deprecated Prefer requireCapability — kept for driver routes that still key off role. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.auth === undefined || !roles.includes(req.auth.role)) {
      next(new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึง'));
      return;
    }
    next();
  };
}

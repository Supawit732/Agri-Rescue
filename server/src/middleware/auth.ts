import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../http/errors';
import '../types/express';
import type { UserRole } from '../types/express';

export const JWT_EXPIRES_IN = '7d';

interface TokenPayload {
  sub: number;
  role: UserRole;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret === undefined || secret.trim() === '') {
    throw new HttpError(500, 'INTERNAL', 'ระบบยังไม่ได้ตั้งค่าความลับของโทเคน');
  }
  return secret;
}

export function signAccessToken(userId: number, role: UserRole): string {
  return jwt.sign({ sub: userId, role }, jwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (header === undefined || !header.startsWith('Bearer ')) {
    next(new HttpError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, jwtSecret()) as TokenPayload;
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || payload.role === undefined) {
      next(new HttpError(401, 'UNAUTHORIZED', 'โทเคนไม่ถูกต้องหรือหมดอายุ'));
      return;
    }
    req.auth = { id, role: payload.role };
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHORIZED', 'โทเคนไม่ถูกต้องหรือหมดอายุ'));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.auth === undefined || !roles.includes(req.auth.role)) {
      next(new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึง'));
      return;
    }
    next();
  };
}

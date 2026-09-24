import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../http/errors';

export const PUBLIC_MARKET_RATE_LIMIT_WINDOW_MS = 60_000;
export const PUBLIC_MARKET_RATE_LIMIT_MAX = 60;

interface Bucket {
  count: number;
  resetAt: number;
}

/** Simple in-memory per-IP counter (D023). Fine for single-process API. */
const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for');
  if (forwarded !== undefined && forwarded.trim() !== '') {
    return forwarded.split(',')[0]?.trim() || req.ip || 'unknown';
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function publicMarketRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (bucket === undefined || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + PUBLIC_MARKET_RATE_LIMIT_WINDOW_MS };
    buckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > PUBLIC_MARKET_RATE_LIMIT_MAX) {
    next(
      new HttpError(429, 'RATE_LIMIT', 'เรียกตลาดสาธารณะบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'),
    );
    return;
  }
  next();
}

/** Test helper — clear in-memory counters. */
export function resetPublicMarketRateLimit(): void {
  buckets.clear();
}

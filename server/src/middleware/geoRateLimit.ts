import rateLimit, { MemoryStore } from 'express-rate-limit';

export const GEO_RATE_LIMIT_WINDOW_MS = 60_000;
export const GEO_RATE_LIMIT_MAX = 20;

const geoRateLimitStore = new MemoryStore();

/** Per-IP limit for /api/geo/* — 20 requests per minute. */
export const geoRateLimit = rateLimit({
  windowMs: GEO_RATE_LIMIT_WINDOW_MS,
  limit: GEO_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: geoRateLimitStore,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT',
        message: 'เรียกบริการตำแหน่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
      },
    });
  },
});

/** Test helper — clear the in-memory geo rate-limit counters. */
export async function resetGeoRateLimit(): Promise<void> {
  await geoRateLimitStore.resetAll();
}

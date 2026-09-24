import rateLimit, { MemoryStore } from 'express-rate-limit';

export const PUBLIC_RATE_LIMIT_WINDOW_MS = 60_000;
export const PUBLIC_RATE_LIMIT_MAX = 60;

const publicRateLimitStore = new MemoryStore();

/** Per-IP limit for /api/public/* — 60 requests per minute. */
export const publicRateLimit = rateLimit({
  windowMs: PUBLIC_RATE_LIMIT_WINDOW_MS,
  limit: PUBLIC_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: publicRateLimitStore,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT',
        message: 'เรียกดูตลาดบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
      },
    });
  },
});

/** Test helper — clear the in-memory public rate-limit counters. */
export async function resetPublicRateLimit(): Promise<void> {
  await publicRateLimitStore.resetAll();
}

import rateLimit, { MemoryStore, ipKeyGenerator } from 'express-rate-limit';

export const SUPPORT_CREATE_RATE_WINDOW_MS = 60 * 60 * 1000;
export const SUPPORT_CREATE_RATE_MAX = 5;

const store = new MemoryStore();

/** 5 tickets / hour / user for POST /api/support/tickets (UI_PLAN PR C). */
export const supportCreateRateLimit = rateLimit({
  windowMs: SUPPORT_CREATE_RATE_WINDOW_MS,
  limit: SUPPORT_CREATE_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: (req) =>
    req.auth !== undefined
      ? `user:${String(req.auth.id)}`
      : ipKeyGenerator(req.ip ?? '0.0.0.0'),
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT',
        message: 'แจ้งเรื่องได้ไม่เกิน 5 เรื่อง/ชั่วโมง กรุณารอสักครู่แล้วลองใหม่',
      },
    });
  },
});

/** Test helper — clear create-ticket rate counters. */
export async function resetSupportCreateRateLimit(): Promise<void> {
  await store.resetAll();
}


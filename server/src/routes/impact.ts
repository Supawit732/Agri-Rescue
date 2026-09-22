import { Router } from 'express';
import { impactSummary } from '../delivery/impactSummary';
import { asyncHandler } from '../http/asyncHandler';
import { requireAuth } from '../middleware/auth';

export const impactRouter = Router();

impactRouter.get(
  '/summary',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ summary: await impactSummary() });
  }),
);

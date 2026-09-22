import { Router } from 'express';
import { z } from 'zod';
import { confirmStop, unlockStop } from '../delivery/confirmStop';
import { asyncHandler } from '../http/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth';

export const stopsRouter = Router();

const confirmSchema = z.object({
  weight_kg: z.number().positive().optional(),
  otp: z.string().regex(/^\d{4}$/, 'รหัสยืนยันต้องเป็นตัวเลข 4 หลัก').optional(),
});

stopsRouter.post(
  '/:id/confirm',
  requireAuth,
  requireRole('driver'),
  asyncHandler(async (req, res) => {
    const stopId = z.coerce.number().int().positive().parse(req.params.id);
    const body = confirmSchema.parse(req.body);
    const result = await confirmStop(stopId, req.auth?.id ?? 0, body);
    res.json(result);
  }),
);

stopsRouter.post(
  '/:id/unlock',
  requireAuth,
  requireRole('coordinator'),
  asyncHandler(async (req, res) => {
    const stopId = z.coerce.number().int().positive().parse(req.params.id);
    res.json(await unlockStop(stopId));
  }),
);

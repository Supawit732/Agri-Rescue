import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { createBatch, loadBatch } from '../delivery/createBatch';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireRole } from '../middleware/auth';

export const batchesRouter = Router();

const createSchema = z.object({
  driver_id: z.number().int().positive('กรุณาระบุคนขับ'),
});

batchesRouter.use(requireAuth);

batchesRouter.post(
  '/',
  requireRole('coordinator'),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const created = await createBatch(body.driver_id);
    res.status(201).json(created);
  }),
);

batchesRouter.get(
  '/:id',
  requireRole('driver', 'coordinator'),
  asyncHandler(async (req, res) => {
    const batchId = z.coerce.number().int().positive().parse(req.params.id);
    const connection = await pool.getConnection();
    try {
      const loaded = await loadBatch(connection, batchId);
      if (req.auth?.role === 'driver' && loaded.batch.driver_id !== req.auth.id) {
        throw new HttpError(403, 'FORBIDDEN', 'ดูหรือยืนยันได้เฉพาะรอบที่มอบหมายให้ตนเอง');
      }
      res.json(loaded);
    } finally {
      connection.release();
    }
  }),
);

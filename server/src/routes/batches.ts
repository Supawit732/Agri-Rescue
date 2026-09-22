import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { createBatch, loadBatch } from '../delivery/createBatch';
import { asyncHandler } from '../http/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth';

export const batchesRouter = Router();

batchesRouter.use(requireAuth);

batchesRouter.post(
  '/',
  requireRole('coordinator'),
  asyncHandler(async (_req, res) => {
    const created = await createBatch();
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
      res.json(loaded);
    } finally {
      connection.release();
    }
  }),
);

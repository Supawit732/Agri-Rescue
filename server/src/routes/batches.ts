import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { createBatch, loadBatch } from '../delivery/createBatch';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';

export const batchesRouter = Router();

const createSchema = z.object({
  driver_id: z.number().int().positive('กรุณาระบุคนขับ'),
});

function requireDriverOrAdmin(req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction): void {
  if (req.auth?.role === 'driver' || req.auth?.is_admin === true) {
    next();
    return;
  }
  next(new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึง'));
}

batchesRouter.use(requireAuth);

batchesRouter.post(
  '/',
  requireCapability('admin'),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const created = await createBatch(body.driver_id);
    res.status(201).json(created);
  }),
);

batchesRouter.get(
  '/',
  requireDriverOrAdmin,
  asyncHandler(async (req, res) => {
    const auth = req.auth;
    if (auth === undefined) {
      throw new HttpError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ');
    }
    const [rows] =
      auth.role === 'driver'
        ? await pool.query<RowDataPacket[]>(
            'SELECT id, driver_id, status, planned_km, created_at FROM batches WHERE driver_id = ? ORDER BY id DESC',
            [auth.id],
          )
        : await pool.query<RowDataPacket[]>(
            'SELECT id, driver_id, status, planned_km, created_at FROM batches ORDER BY id DESC',
          );
    res.json({
      batches: rows.map((row) => ({
        id: Number(row.id),
        driver_id: row.driver_id === null ? null : Number(row.driver_id),
        status: row.status as 'planned' | 'in_progress' | 'completed',
        planned_km: Number(row.planned_km),
        created_at: new Date(row.created_at as string).toISOString(),
      })),
    });
  }),
);

batchesRouter.get(
  '/drivers',
  requireCapability('admin'),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name, phone FROM users WHERE role = 'driver' ORDER BY name, id",
    );
    res.json({
      drivers: rows.map((row) => ({ id: Number(row.id), name: String(row.name), phone: String(row.phone) })),
    });
  }),
);

batchesRouter.get(
  '/:id',
  requireDriverOrAdmin,
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

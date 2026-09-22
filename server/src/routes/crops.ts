import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { asyncHandler } from '../http/asyncHandler';

export const cropsRouter = Router();

cropsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name_th, base_shelf_days, market_price_per_kg FROM crops ORDER BY id',
    );
    res.json({ crops: rows });
  }),
);

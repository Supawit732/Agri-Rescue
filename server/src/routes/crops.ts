import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';

export const cropsRouter = Router();

cropsRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name_th, name_en, sort_order, default_shelf_days, parcel_allowed
       FROM crop_categories
       ORDER BY sort_order ASC, id ASC`,
    );
    res.json({
      categories: rows.map((row) => ({
        id: Number(row.id),
        name_th: String(row.name_th),
        name_en: row.name_en === null ? null : String(row.name_en),
        sort_order: Number(row.sort_order),
        default_shelf_days: Number(row.default_shelf_days),
        parcel_allowed: row.parcel_allowed === 1 || row.parcel_allowed === true,
      })),
    });
  }),
);

cropsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name_th, name_en, base_shelf_days, market_price_per_kg, category_id,
              dit_product_code, dit_unit, dit_unit_to_kg,
              normal_features_th, defect_examples_th,
              status, parcel_allowed
       FROM crops
       WHERE status = 'approved'
       ORDER BY id`,
    );
    res.json({
      crops: rows.map((row) => ({
        id: Number(row.id),
        name_th: String(row.name_th),
        name_en: row.name_en === null ? null : String(row.name_en),
        base_shelf_days: Number(row.base_shelf_days),
        market_price_per_kg: Number(row.market_price_per_kg),
        category_id: row.category_id === null ? null : Number(row.category_id),
        dit_product_code: row.dit_product_code === null ? null : String(row.dit_product_code),
        dit_unit: row.dit_unit === null ? null : String(row.dit_unit),
        dit_unit_to_kg: row.dit_unit_to_kg === null ? null : Number(row.dit_unit_to_kg),
        normal_features_th: row.normal_features_th === null ? null : String(row.normal_features_th),
        defect_examples_th: row.defect_examples_th === null ? null : String(row.defect_examples_th),
        status: String(row.status),
        parcel_allowed: row.parcel_allowed === 1 || row.parcel_allowed === true,
      })),
    });
  }),
);

cropsRouter.get(
  '/my-frequent',
  requireAuth,
  requireCapability('sell'),
  asyncHandler(async (req, res) => {
    const userId = req.auth!.id;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT c.id, c.name_th, c.name_en, c.base_shelf_days, c.market_price_per_kg,
              c.category_id, c.status, c.parcel_allowed,
              COUNT(hl.id) AS lot_count
       FROM harvest_lots hl
       JOIN plots p ON hl.plot_id = p.id
       JOIN crops c ON hl.crop_id = c.id
       WHERE p.farmer_id = ?
       GROUP BY c.id
       ORDER BY lot_count DESC
       LIMIT 5`,
      [userId],
    );
    res.json({
      crops: rows.map((row) => ({
        id: Number(row.id),
        name_th: String(row.name_th),
        name_en: row.name_en === null ? null : String(row.name_en),
        base_shelf_days: Number(row.base_shelf_days),
        market_price_per_kg: Number(row.market_price_per_kg),
        category_id: row.category_id === null ? null : Number(row.category_id),
        status: String(row.status),
        parcel_allowed: row.parcel_allowed === 1 || row.parcel_allowed === true,
        lot_count: Number(row.lot_count),
      })),
    });
  }),
);

const proposeCropSchema = z.object({
  name_th: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100).optional(),
  category_id: z.number().int().positive(),
  market_price_per_kg: z.number().positive(),
});

cropsRouter.post(
  '/propose',
  requireAuth,
  requireCapability('sell'),
  asyncHandler(async (req, res) => {
    const parsed = proposeCropSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string') fields[key] = issue.message;
      }
      throw new HttpError(400, 'VALIDATION', 'ข้อมูลไม่ถูกต้อง', fields);
    }
    const { name_th, name_en, category_id, market_price_per_kg } = parsed.data;

    const [catRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, default_shelf_days, parcel_allowed,
              default_normal_features_th, default_defect_examples_th
       FROM crop_categories WHERE id = ?`,
      [category_id],
    );
    const cat = catRows[0];
    if (cat === undefined) {
      throw new HttpError(400, 'VALIDATION', 'ข้อมูลไม่ถูกต้อง', { category_id: 'หมวดหมู่ไม่ถูกต้อง' });
    }

    const [dup] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM crops WHERE name_th = ?',
      [name_th],
    );
    if (dup.length > 0) {
      throw new HttpError(409, 'DUPLICATE', 'มีพืชชื่อนี้อยู่แล้ว', { name_th: 'มีพืชชื่อนี้อยู่แล้ว' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query<RowDataPacket[]>(
        `INSERT INTO crops
           (name_th, name_en, base_shelf_days, market_price_per_kg, category_id,
            normal_features_th, defect_examples_th, parcel_allowed, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          name_th,
          name_en ?? null,
          Number(cat.default_shelf_days),
          market_price_per_kg,
          category_id,
          cat.default_normal_features_th ?? null,
          cat.default_defect_examples_th ?? null,
          cat.parcel_allowed === 1 ? 1 : 0,
          req.auth!.id,
        ],
      );
      await conn.commit();
      const insertId = (result as unknown as { insertId: number }).insertId;
      res.status(201).json({ id: insertId, status: 'pending' });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }),
);

import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { asyncHandler } from '../http/asyncHandler';

export const cropsRouter = Router();

cropsRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name_th, name_en, sort_order
       FROM crop_categories
       ORDER BY sort_order ASC, id ASC`,
    );
    res.json({
      categories: rows.map((row) => ({
        id: Number(row.id),
        name_th: String(row.name_th),
        name_en: row.name_en === null ? null : String(row.name_en),
        sort_order: Number(row.sort_order),
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
              normal_features_th, defect_examples_th
       FROM crops
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
      })),
    });
  }),
);

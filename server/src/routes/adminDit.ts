import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { searchDitProducts, suggestDitProducts, type DitProductCandidate } from '../domain/ditSuggest';
import { pool } from '../db/pool';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';
import {
  daysAgoIso,
  fetchMocPrices,
  isoDateOnly,
  latestDayMidpoint,
  type FetchJson,
} from '../pricing/mocClient';
import { clearMocProductCacheForTests, getCachedMocProducts } from '../pricing/mocProductCache';
import { syncAllMappedCropPrices, syncCropReferencePrice } from '../pricing/referencePrices';

export const adminDitRouter = Router();

adminDitRouter.use(requireAuth, requireCapability('admin'));

const mappingSchema = z.object({
  product_code: z.string().trim().min(1).max(32),
  unit_to_kg: z.number().positive().nullable().optional(),
});

async function loadMocCatalog(input?: { forceRefresh?: boolean }) {
  try {
    return await getCachedMocProducts(input);
  } catch {
    throw new HttpError(502, 'MOC_UNAVAILABLE', 'ดึงรายการสินค้าจากกรมการค้าภายในไม่สำเร็จ ลองใหม่ภายหลัง');
  }
}
async function latestPriceForProduct(
  productId: string,
  fetchJson?: FetchJson,
): Promise<{ price: number; date: string; unit: string | null } | null> {
  try {
    const today = new Date();
    const { response } = await fetchMocPrices({
      productId,
      fromDate: daysAgoIso(14, today),
      toDate: isoDateOnly(today),
      fetchJson,
    });
    const latest = latestDayMidpoint(response);
    if (latest === null) {
      return null;
    }
    return { price: latest.midpoint, date: latest.date, unit: latest.unit };
  } catch {
    return null;
  }
}

async function attachPrices(
  candidates: DitProductCandidate[],
  fetchJson?: FetchJson,
): Promise<
  Array<
    DitProductCandidate & {
      latest_price: number | null;
      price_date: string | null;
      price_unit: string | null;
    }
  >
> {
  return Promise.all(
    candidates.map(async (item) => {
      const price = await latestPriceForProduct(item.product_id, fetchJson);
      return {
        ...item,
        latest_price: price?.price ?? null,
        price_date: price?.date ?? null,
        price_unit: price?.unit ?? null,
      };
    }),
  );
}

adminDitRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const cached = await loadMocCatalog();
    const products = q.trim() === '' ? cached.products.slice(0, 50) : searchDitProducts(q, cached.products, 30);
    res.json({
      products,
      fetched_at: cached.fetched_at,
      from_cache: cached.from_cache,
    });
  }),
);

adminDitRouter.post(
  '/products/refresh',
  asyncHandler(async (_req, res) => {
    const cached = await loadMocCatalog({ forceRefresh: true });
    res.json({
      count: cached.products.length,
      fetched_at: cached.fetched_at,
      from_cache: cached.from_cache,
    });
  }),
);

adminDitRouter.get(
  '/crops',
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT c.id, c.name_th, c.market_price_per_kg, c.dit_product_code, c.dit_unit, c.dit_unit_to_kg,
              r.date AS ref_date, r.wholesale_price AS ref_wholesale_price, r.unit AS ref_unit
       FROM crops c
       LEFT JOIN crop_reference_prices r
         ON r.id = (
           SELECT r2.id FROM crop_reference_prices r2
           WHERE r2.crop_id = c.id
           ORDER BY r2.date DESC, r2.id DESC
           LIMIT 1
         )
       ORDER BY c.id`,
    );
    const cached = await loadMocCatalog();
    const crops = await Promise.all(
      rows.map(async (row) => {
        const top = suggestDitProducts(String(row.name_th), cached.products, 3);
        const suggestions = await attachPrices(top);
        return {
          id: Number(row.id),
          name_th: String(row.name_th),
          market_price_per_kg: Number(row.market_price_per_kg),
          dit_product_code: row.dit_product_code === null ? null : String(row.dit_product_code),
          dit_unit: row.dit_unit === null ? null : String(row.dit_unit),
          dit_unit_to_kg: row.dit_unit_to_kg === null ? null : Number(row.dit_unit_to_kg),
          latest_ref_price:
            row.ref_wholesale_price === null || row.ref_wholesale_price === undefined
              ? null
              : {
                  date: String(row.ref_date).slice(0, 10),
                  wholesale_price: Number(row.ref_wholesale_price),
                  unit: row.ref_unit === null ? null : String(row.ref_unit),
                },
          suggestions: suggestions.map((s) => ({
            product_code: s.product_id,
            product_name: s.product_name,
            unit: s.unit,
            sell_type: s.sell_type,
            category_name: s.category_name,
            latest_price: s.latest_price,
            price_date: s.price_date,
            price_unit: s.price_unit,
          })),
        };
      }),
    );
    res.json({
      crops,
      products_fetched_at: cached.fetched_at,
      products_from_cache: cached.from_cache,
    });
  }),
);

adminDitRouter.post(
  '/crops/:id/mapping',
  asyncHandler(async (req, res) => {
    const cropId = z.coerce.number().int().positive().parse(req.params.id);
    const body = mappingSchema.parse(req.body);
    const [crops] = await pool.query<RowDataPacket[]>('SELECT id FROM crops WHERE id = ?', [cropId]);
    if (crops[0] === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบพืชผล');
    }
    const cached = await loadMocCatalog();
    const match = cached.products.find((p) => p.product_id === body.product_code);
    const unitFromCatalog = match?.unit && match.unit !== 'unknown' ? match.unit : null;
    if (body.unit_to_kg === undefined) {
      await pool.query(`UPDATE crops SET dit_product_code = ?, dit_unit = COALESCE(?, dit_unit) WHERE id = ?`, [
        body.product_code,
        unitFromCatalog,
        cropId,
      ]);
    } else {
      await pool.query(
        `UPDATE crops SET dit_product_code = ?, dit_unit = COALESCE(?, dit_unit), dit_unit_to_kg = ? WHERE id = ?`,
        [body.product_code, unitFromCatalog, body.unit_to_kg, cropId],
      );
    }
    const sync = await syncCropReferencePrice({
      cropId,
      productCode: body.product_code,
    });
    res.json({
      crop_id: cropId,
      product_code: body.product_code,
      unit_to_kg: body.unit_to_kg === undefined ? undefined : body.unit_to_kg,
      sync,
    });
  }),
);

adminDitRouter.post(
  '/crops/:id/suggest',
  asyncHandler(async (req, res) => {
    const cropId = z.coerce.number().int().positive().parse(req.params.id);
    const [crops] = await pool.query<RowDataPacket[]>('SELECT id, name_th FROM crops WHERE id = ?', [cropId]);
    const crop = crops[0];
    if (crop === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบพืชผล');
    }
    const cached = await loadMocCatalog();
    const top = suggestDitProducts(String(crop.name_th), cached.products, 3);
    const withPrices = await attachPrices(top);
    res.json({
      suggestions: withPrices.map((s) => ({
        crop_id: cropId,
        product_code: s.product_id,
        product_name: s.product_name,
        sell_type: s.sell_type,
        unit: s.unit,
        latest_price: s.latest_price,
        price_date: s.price_date,
        status: 'pending' as const,
      })),
    });
  }),
);

adminDitRouter.post(
  '/suggestions/:id/accept',
  asyncHandler(async (req, res) => {
    const suggestionId = z.coerce.number().int().positive().parse(req.params.id);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id, crop_id, product_code, status FROM dit_mapping_suggestions WHERE id = ? FOR UPDATE`,
        [suggestionId],
      );
      const suggestion = rows[0];
      if (suggestion === undefined) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำแนะนำการจับคู่');
      }
      if (String(suggestion.status) !== 'pending') {
        throw new HttpError(409, 'CONFLICT', 'คำแนะนำนี้ถูกตรวจแล้ว');
      }
      const cropId = Number(suggestion.crop_id);
      const productCode = String(suggestion.product_code);
      await connection.query(`UPDATE crops SET dit_product_code = ? WHERE id = ?`, [productCode, cropId]);
      await connection.query(
        `UPDATE dit_mapping_suggestions
         SET status = 'accepted', reviewed_at = UTC_TIMESTAMP()
         WHERE id = ?`,
        [suggestionId],
      );
      await connection.commit();
      const sync = await syncCropReferencePrice({ cropId, productCode });
      res.json({
        suggestion_id: suggestionId,
        crop_id: cropId,
        product_code: productCode,
        status: 'accepted',
        sync,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

adminDitRouter.post(
  '/suggestions/:id/reject',
  asyncHandler(async (req, res) => {
    const suggestionId = z.coerce.number().int().positive().parse(req.params.id);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE dit_mapping_suggestions
       SET status = 'rejected', reviewed_at = UTC_TIMESTAMP()
       WHERE id = ? AND status = 'pending'`,
      [suggestionId],
    );
    if (result.affectedRows === 0) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำแนะนำที่รอตรวจ');
    }
    res.json({ suggestion_id: suggestionId, status: 'rejected' });
  }),
);

adminDitRouter.post(
  '/sync',
  asyncHandler(async (_req, res) => {
    if (process.env.MOC_SYNC_SKIP === '1') {
      res.json({ synced: 0, skipped: true });
      return;
    }
    const synced = await syncAllMappedCropPrices();
    res.json({ synced, skipped: false });
  }),
);

export { clearMocProductCacheForTests };

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';
import {
  ensureShop,
  followShop,
  isFollowing,
  listFollowedShops,
  loadPublicShop,
  unfollowShop,
  updateShop,
} from '../shops/shopService';

export const shopsRouter = Router();

const shopIdSchema = z.coerce.number().int().positive();

function viewerCoords(req: { query: Record<string, unknown> }): {
  lat: number;
  lng: number;
} | null {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && req.query.lat !== undefined && req.query.lng !== undefined) {
    return { lat, lng };
  }
  return null;
}

/** GET /api/shops/:userId — public shop profile (no private contact/coords). */
shopsRouter.get(
  '/:userId',
  asyncHandler(async (req, res) => {
    const shopId = shopIdSchema.parse(req.params.userId);
    const viewerId = req.auth?.id ?? null;
    const shop = await loadPublicShop(shopId, viewerCoords(req), viewerId);
    if (shop === null) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบร้าน');
    }
    res.json({ shop });
  }),
);

/** GET /api/shops/:userId/lots?status=selling|sold — public lots for shop tabs. */
shopsRouter.get(
  '/:userId/lots',
  asyncHandler(async (req, res) => {
    const shopId = shopIdSchema.parse(req.params.userId);
    const status = z.enum(['selling', 'sold']).default('selling').parse(req.query.status);
    const { pool } = await import('../db/pool');
    const statusFilter =
      status === 'selling'
        ? `h.status IN ('open', 'partially_reserved') AND h.expires_at > UTC_TIMESTAMP() AND h.deleted_at IS NULL`
        : `h.status IN ('delivered', 'expired') AND h.deleted_at IS NULL`;
    const [rows] = await pool.query(
      `SELECT h.id, h.crop_id, h.weight_kg, h.grade, h.ripeness, h.expires_at, h.status,
              h.start_price_per_kg, h.floor_price_per_kg, h.sale_mode, h.donation_opened,
              h.photo_url, c.name_th AS crop_name_th, c.name_en AS crop_name_en,
              COALESCE((
                SELECT SUM(o.quantity_kg) FROM orders o
                WHERE o.lot_id = h.id AND o.status IN ('reserved', 'picked', 'delivered')
              ), 0) AS reserved_kg
       FROM harvest_lots h
       JOIN plots p ON p.id = h.plot_id
       JOIN crops c ON c.id = h.crop_id
       WHERE p.farmer_id = ? AND ${statusFilter}
       ORDER BY h.expires_at ASC, h.id DESC
       LIMIT 50`,
      [shopId],
    );
    res.json({ lots: rows });
  }),
);

/** PATCH /api/shops/mine — owner edits name/description. */
shopsRouter.patch(
  '/mine',
  requireAuth,
  requireCapability('sell'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1, 'กรุณากรอกชื่อร้าน').max(120).optional(),
        description: z.string().trim().max(500).nullable().optional(),
      })
      .refine((b) => b.name !== undefined || b.description !== undefined, {
        message: 'ไม่มีข้อมูลที่จะอัปเดต',
      })
      .parse(req.body);
    const userId = req.auth?.id ?? 0;
    await updateShop(userId, body);
    const shop = await loadPublicShop(userId, null, userId);
    res.json({ shop });
  }),
);

/** POST /api/shops/:userId/follow — must be logged in. */
shopsRouter.post(
  '/:userId/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    const shopId = shopIdSchema.parse(req.params.userId);
    const followerId = req.auth?.id ?? 0;
    if (shopId === followerId) {
      throw new HttpError(400, 'VALIDATION', 'ติดตามร้านตัวเองไม่ได้');
    }
    const shop = await loadPublicShop(shopId, null, followerId);
    if (shop === null) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบร้าน');
    }
    const result = await followShop(followerId, shopId);
    const followed = await loadPublicShop(shopId, null, followerId);
    res.status(result === 'created' ? 201 : 200).json({
      status: result,
      following: true,
      shop: followed,
    });
  }),
);

shopsRouter.delete(
  '/:userId/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    const shopId = shopIdSchema.parse(req.params.userId);
    const followerId = req.auth?.id ?? 0;
    await unfollowShop(followerId, shopId);
    const followed = await loadPublicShop(shopId, null, followerId);
    res.json({ following: false, shop: followed });
  }),
);

/** GET /api/shops/mine/followed — list of followed shops. */
shopsRouter.get(
  '/mine/followed',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth?.id ?? 0;
    const shops = await listFollowedShops(userId);
    res.json({ shops });
  }),
);

/** POST /api/shops/mine/ensure — ensure shop exists when enabling sell. */
shopsRouter.post(
  '/mine/ensure',
  requireAuth,
  requireCapability('sell'),
  asyncHandler(async (req, res) => {
    const userId = req.auth?.id ?? 0;
    await ensureShop(userId);
    const shop = await loadPublicShop(userId, null, userId);
    res.json({ shop });
  }),
);

// keep isFollowing exported usage for tests if needed
void isFollowing;

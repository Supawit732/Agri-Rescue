import type { PoolConnection } from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { haversineKm } from '../domain/geo';
import { locationDisplayLabelFor } from '../geo/locationLabel';

export interface ShopRow {
  user_id: number;
  name: string;
  avatar: string | null;
  cover: string | null;
  description: string | null;
}

export interface PublicShopView {
  id: number;
  user_id: number;
  name: string;
  avatar: string | null;
  cover: string | null;
  description: string | null;
  location_label: string | null;
  distance_km: number | null;
  common_crops: Array<{ name_th: string; name_en: string | null }>;
  stats: {
    delivered_orders: number;
    followers: number;
    kg_saved: number;
  };
  is_following: boolean;
}

async function defaultShopName(connection: PoolConnection | typeof pool, userId: number): Promise<string> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT name FROM users WHERE id = ?`,
    [userId],
  );
  const name = rows[0]?.name;
  if (name !== undefined && name !== null && String(name).trim() !== '') {
    return String(name);
  }
  return `ร้าน #${userId}`;
}

/** Create shop if missing. Safe to call when enabling sell or creating a lot. */
export async function ensureShop(
  userId: number,
  connection?: PoolConnection,
): Promise<number> {
  const conn = connection ?? (await pool.getConnection());
  const own = connection === undefined;
  try {
    const [existing] = await conn.query<RowDataPacket[]>(
      `SELECT user_id FROM shops WHERE user_id = ?`,
      [userId],
    );
    if (existing[0] !== undefined) {
      return Number(existing[0].user_id);
    }
    const name = await defaultShopName(conn, userId);
    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO shops (user_id, name) VALUES (?, ?)`,
      [userId, name],
    );
    return result.insertId > 0 ? userId : userId;
  } finally {
    if (own) {
      conn.release();
    }
  }
}

export async function updateShop(
  userId: number,
  input: { name?: string; description?: string | null; avatar?: string | null; cover?: string | null },
): Promise<void> {
  await ensureShop(userId);
  const updates: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    updates.push('name = ?');
    params.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push('description = ?');
    params.push(input.description === '' ? null : input.description);
  }
  if (input.avatar !== undefined) {
    updates.push('avatar = ?');
    params.push(input.avatar);
  }
  if (input.cover !== undefined) {
    updates.push('cover = ?');
    params.push(input.cover);
  }
  if (updates.length === 0) {
    return;
  }
  params.push(userId);
  await pool.query(`UPDATE shops SET ${updates.join(', ')} WHERE user_id = ?`, params);
}

export async function followerIds(shopId: number): Promise<number[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT user_id FROM shop_follows WHERE shop_id = ?`,
    [shopId],
  );
  return rows.map((r) => Number(r.user_id));
}

export async function followShop(followerId: number, shopId: number): Promise<'created' | 'exists'> {
  await ensureShop(shopId);
  try {
    await pool.query(
      `INSERT INTO shop_follows (user_id, shop_id) VALUES (?, ?)`,
      [followerId, shopId],
    );
    return 'created';
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      return 'exists';
    }
    throw error;
  }
}

export async function unfollowShop(followerId: number, shopId: number): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM shop_follows WHERE user_id = ? AND shop_id = ?`,
    [followerId, shopId],
  );
  return result.affectedRows > 0;
}

export async function isFollowing(followerId: number | null, shopId: number): Promise<boolean> {
  if (followerId === null || followerId <= 0) {
    return false;
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS x FROM shop_follows WHERE user_id = ? AND shop_id = ?`,
    [followerId, shopId],
  );
  return rows.length > 0;
}

export async function loadShopOwner(userId: number): Promise<RowDataPacket | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.user_id, s.name, s.avatar, s.cover, s.description,
            u.lat, u.lng, u.subdistrict_th AS user_subdistrict_th, u.district_th AS user_district_th,
            u.subdistrict_en AS user_subdistrict_en, u.district_en AS user_district_en,
            p.name AS plot_name, p.lat AS plot_lat, p.lng AS plot_lng,
            p.subdistrict_th AS plot_subdistrict_th, p.district_th AS plot_district_th,
            p.subdistrict_en AS plot_subdistrict_en, p.district_en AS plot_district_en
     FROM shops s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN plots p ON p.farmer_id = u.id
     WHERE s.user_id = ?
     ORDER BY p.id ASC
     LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function shopStats(shopId: number): Promise<PublicShopView['stats']> {
  const [orderRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS delivered, COALESCE(SUM(i.kg_saved), 0) AS kg
     FROM orders o
     JOIN harvest_lots h ON h.id = o.lot_id
     JOIN plots p ON p.id = h.plot_id
     LEFT JOIN impact_logs i ON i.order_id = o.id
     WHERE p.farmer_id = ? AND o.status = 'delivered'`,
    [shopId],
  );
  const [followRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM shop_follows WHERE shop_id = ?`,
    [shopId],
  );
  return {
    delivered_orders: Number(orderRows[0]?.delivered ?? 0),
    followers: Number(followRows[0]?.cnt ?? 0),
    kg_saved: Math.round(Number(orderRows[0]?.kg ?? 0) * 100) / 100,
  };
}

export async function commonCrops(
  shopId: number,
  limit = 3,
): Promise<Array<{ name_th: string; name_en: string | null }>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.name_th, c.name_en
     FROM harvest_lots h
     JOIN plots p ON p.id = h.plot_id
     JOIN crops c ON c.id = h.crop_id
     WHERE p.farmer_id = ? AND h.deleted_at IS NULL
     GROUP BY c.name_th, c.name_en, c.id
     ORDER BY COUNT(*) DESC, c.id ASC
     LIMIT ${Math.min(Math.max(limit, 1), 10)}`,
    [shopId],
  );
  return rows.map((r) => ({
    name_th: String(r.name_th),
    name_en: r.name_en === null || r.name_en === '' ? null : String(r.name_en),
  }));
}

function locationLabel(row: RowDataPacket, locale: 'th' | 'en' = 'th'): string | null {
  const plotName = row.plot_name === null || row.plot_name === undefined ? null : String(row.plot_name);
  return locationDisplayLabelFor(locale, {
    subdistrict_th: row.plot_subdistrict_th ?? row.user_subdistrict_th,
    district_th: row.plot_district_th ?? row.user_district_th,
    subdistrict_en: row.plot_subdistrict_en ?? row.user_subdistrict_en,
    district_en: row.plot_district_en ?? row.user_district_en,
    fallback: plotName,
  });
}

export async function loadPublicShop(
  shopId: number,
  viewer: { lat: number; lng: number } | null,
  viewerId: number | null,
  locale: 'th' | 'en' = 'th',
): Promise<PublicShopView | null> {
  const row = await loadShopOwner(shopId);
  if (row === null) {
    return null;
  }
  const plotLat = row.plot_lat === null || row.plot_lat === undefined ? null : Number(row.plot_lat);
  const plotLng = row.plot_lng === null || row.plot_lng === undefined ? null : Number(row.plot_lng);
  let distanceKm: number | null = null;
  if (viewer !== null && plotLat !== null && plotLng !== null) {
    distanceKm = Math.round(haversineKm(viewer, { lat: plotLat, lng: plotLng }) * 2) / 2;
  }
  const [stats, crops, following] = await Promise.all([
    shopStats(shopId),
    commonCrops(shopId),
    isFollowing(viewerId, shopId),
  ]);
  return {
    id: shopId,
    user_id: shopId,
    name: String(row.name),
    avatar: row.avatar === null || row.avatar === undefined ? null : String(row.avatar),
    cover: row.cover === null || row.cover === undefined ? null : String(row.cover),
    description: row.description === null || row.description === undefined ? null : String(row.description),
    location_label: locationLabel(row, locale),
    distance_km: distanceKm,
    common_crops: crops,
    stats,
    is_following: following,
  };
}

export async function listFollowedShops(userId: number): Promise<Array<{ user_id: number; name: string; avatar: string | null; description: string | null }>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.user_id, s.name, s.avatar, s.description
     FROM shop_follows f
     JOIN shops s ON s.user_id = f.shop_id
     WHERE f.user_id = ?
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    user_id: Number(r.user_id),
    name: String(r.name),
    avatar: r.avatar === null || r.avatar === undefined ? null : String(r.avatar),
    description: r.description === null || r.description === undefined ? null : String(r.description),
  }));
}

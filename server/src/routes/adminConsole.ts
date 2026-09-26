import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';
import { buildOverview } from '../admin/overviewService';

export const adminConsoleRouter = Router();

adminConsoleRouter.use(requireAuth, requireCapability('admin'));

/** Single overview payload for admin dashboard. */
adminConsoleRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json(await buildOverview());
  }),
);

/** Inbox queues for งานรอจัดการ (combined badge). */
adminConsoleRouter.get(
  '/inbox',
  asyncHandler(async (_req, res) => {
    const [orgs] = await pool.query<RowDataPacket[]>(
      `SELECT u.id AS user_id, u.name, bp.org_name, bp.org_type, bp.org_status, bp.created_at
       FROM buyer_profiles bp
       JOIN users u ON u.id = bp.user_id
       WHERE bp.application_kind = 'organization'
         AND bp.org_status IN ('pending', 'needs_more_info')
       ORDER BY bp.created_at ASC`,
    );
    const [support] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, topic, topic_label, status, has_new_reply, updated_at
       FROM support_tickets
       WHERE status = 'open'
       ORDER BY updated_at DESC
       LIMIT 50`,
    );
    const [weights] = await pool.query<RowDataPacket[]>(
      `SELECT s.id, s.batch_id, s.lot_id, s.buyer_id, s.weight_flag, s.confirmed_weight_kg, s.status
       FROM route_stops s
       WHERE s.weight_flag = 1
       ORDER BY s.id DESC
       LIMIT 50`,
    );
    const [otps] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.lot_id, o.buyer_id, o.otp_attempts, o.status
       FROM orders o
       WHERE o.otp_attempts >= 5 AND o.status NOT IN ('delivered', 'cancelled')
       ORDER BY o.id DESC
       LIMIT 50`,
    );
    const [overdue] = await pool.query<RowDataPacket[]>(
      `SELECT id, order_id, due_at
       FROM donation_proofs
       WHERE status = 'pending' AND due_at < UTC_TIMESTAMP()
       ORDER BY due_at ASC
       LIMIT 50`,
    );
    const orgItems = orgs.map((r) => ({
      kind: 'org' as const,
      id: Number(r.user_id),
      title: String(r.org_name ?? r.name),
      subtitle: r.org_type === null ? null : String(r.org_type),
      status: String(r.org_status),
      updated_at: new Date(r.created_at as Date).toISOString(),
      link: `/admin?tab=orgs&user=${String(r.user_id)}`,
    }));
    const supportItems = support.map((r) => ({
      kind: 'support' as const,
      id: Number(r.id),
      title: String(r.topic_label ?? r.topic),
      subtitle: null,
      status: String(r.status),
      updated_at: new Date(r.updated_at as Date).toISOString(),
      link: `/support/${String(r.id)}`,
      badge: Number(r.has_new_reply) === 1 ? 'new' : null,
    }));
    const weightItems = weights.map((r) => ({
      kind: 'weight' as const,
      id: Number(r.id),
      title: `weight_flag lot#${String(r.lot_id ?? '')}`,
      subtitle:
        r.confirmed_weight_kg === null || r.confirmed_weight_kg === undefined
          ? null
          : String(r.confirmed_weight_kg),
      status: String(r.status),
      updated_at: new Date().toISOString(),
      link: '/admin?tab=system',
    }));
    const otpItems = otps.map((r) => ({
      kind: 'otp' as const,
      id: Number(r.id),
      title: `OTP locked order#${String(r.id)}`,
      subtitle: `${String(r.otp_attempts)}/5`,
      status: String(r.status),
      updated_at: new Date().toISOString(),
      link: '/admin?tab=system',
    }));
    const overdueItems = overdue.map((r) => ({
      kind: 'proof' as const,
      id: Number(r.id),
      title: `proof order#${String(r.order_id)}`,
      subtitle: null,
      status: 'overdue',
      updated_at: new Date(r.due_at as Date).toISOString(),
      link: '/admin?tab=overview',
    }));
    res.json({
      counts: {
        org: orgItems.length,
        support: supportItems.length,
        weight: weightItems.length,
        otp: otpItems.length,
        proof: overdueItems.length,
        total:
          orgItems.length +
          supportItems.length +
          weightItems.length +
          otpItems.length +
          overdueItems.length,
      },
      items: [...orgItems, ...supportItems, ...weightItems, ...otpItems, ...overdueItems],
    });
  }),
);

/** Admin market: all lots incl. hidden, optional search. */
adminConsoleRouter.get(
  '/lots',
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        q: z.string().trim().max(80).optional(),
        status: z.enum(['all', 'active', 'hidden', 'delivered', 'expired']).default('all'),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const params: unknown[] = [];
    let where = '1 = 1';
    if (query.status === 'active') {
      where += ` AND h.deleted_at IS NULL AND h.status IN ('open', 'partially_reserved')`;
    } else if (query.status === 'hidden') {
      where += ` AND h.deleted_at IS NOT NULL`;
    } else if (query.status === 'delivered') {
      where += ` AND h.deleted_at IS NULL AND h.status = 'delivered'`;
    } else if (query.status === 'expired') {
      where += ` AND h.deleted_at IS NULL AND h.status = 'expired'`;
    }
    if (query.q !== undefined && query.q !== '') {
      where += ` AND (c.name_th LIKE ? OR s.name LIKE ? OR u.name LIKE ? OR CAST(h.id AS CHAR) = ?)`;
      const like = `%${query.q}%`;
      params.push(like, like, like, query.q);
    }
    params.push(query.limit);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT h.id, h.status, h.weight_kg, h.grade, h.ripeness, h.expires_at, h.deleted_at,
              h.start_price_per_kg, c.name_th AS crop_name, c.name_en AS crop_name_en,
              p.farmer_id, u.name AS seller_name, s.name AS shop_name,
              COALESCE((
                SELECT SUM(o.quantity_kg) FROM orders o
                WHERE o.lot_id = h.id AND o.status IN ('reserved', 'picked', 'delivered')
              ), 0) AS reserved_kg,
              (SELECT dl.reason FROM lot_delete_logs dl
                WHERE dl.lot_id = h.id ORDER BY dl.id DESC LIMIT 1) AS hide_reason
       FROM harvest_lots h
       JOIN crops c ON c.id = h.crop_id
       JOIN plots p ON p.id = h.plot_id
       JOIN users u ON u.id = p.farmer_id
       LEFT JOIN shops s ON s.user_id = p.farmer_id
       WHERE ${where}
       ORDER BY h.id DESC
       LIMIT ${query.limit}`,
      params,
    );

    res.json({
      lots: rows.map((r) => ({
        id: Number(r.id),
        status: String(r.status),
        hidden: r.deleted_at !== null && r.deleted_at !== undefined,
        hide_reason: r.hide_reason == null ? null : String(r.hide_reason),
        crop_name: String(r.crop_name),
        crop_name_en: r.crop_name_en == null ? null : String(r.crop_name_en),
        weight_kg: n(r.weight_kg),
        reserved_kg: n(r.reserved_kg),
        grade: String(r.grade),
        ripeness: n(r.ripeness),
        price: r.start_price_per_kg == null ? null : n(r.start_price_per_kg),
        expires_at: new Date(r.expires_at as Date).toISOString(),
        farmer_id: n(r.farmer_id),
        seller_name: String(r.seller_name),
        shop_name: r.shop_name == null ? null : String(r.shop_name),
      })),
    });
  }),
);

/** Hide lot with reason (log) — admin soft-delete. */
adminConsoleRouter.post(
  '/lots/:id/hide',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z
      .object({ reason: z.string().trim().min(1, 'กรุณากรอกเหตุผล').max(512) })
      .parse(req.body);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id, plot_id, crop_id, weight_kg, grade, ripeness, sale_mode, status, deleted_at,
                start_price_per_kg, floor_price_per_kg, expires_at
         FROM harvest_lots WHERE id = ? FOR UPDATE`,
        [id],
      );
      const lot = rows[0];
      if (lot === undefined) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
      }
      if (lot.deleted_at !== null && lot.deleted_at !== undefined) {
        throw new HttpError(409, 'CONFLICT', 'ซ่อนล็อตนี้ไปแล้ว');
      }
      const snapshot = {
        id,
        status: lot.status,
        weight_kg: n(lot.weight_kg),
        crop_id: n(lot.crop_id),
        plot_id: n(lot.plot_id),
      };
      await connection.query(
        `UPDATE harvest_lots SET deleted_at = UTC_TIMESTAMP() WHERE id = ?`,
        [id],
      );
      await connection.query(
        `INSERT INTO lot_delete_logs (lot_id, farmer_id, reason, snapshot_json)
         VALUES (?, ?, ?, ?)`,
        [id, n(lot.plot_id), `admin_hide:${body.reason}`, JSON.stringify(snapshot)],
      );
      await connection.commit();
      res.json({ ok: true, id, hidden: true, reason: body.reason });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

/** Unhide previously hidden lot. */
adminConsoleRouter.post(
  '/lots/:id/unhide',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE harvest_lots SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
      [id],
    );
    if (result.affectedRows === 0) {
      const [exists] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM harvest_lots WHERE id = ?',
        [id],
      );
      if (exists.length === 0) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
      }
      throw new HttpError(409, 'CONFLICT', 'ล็อตนี้ยังไม่ได้ซ่อน');
    }
    await pool.query(
      `INSERT INTO lot_delete_logs (lot_id, farmer_id, reason, snapshot_json)
       VALUES (?, 0, 'admin_unhide', JSON_OBJECT('id', ?))`,
      [id, id],
    );
    res.json({ ok: true, id, hidden: false });
  }),
);

/** Read-only user directory for ข้อมูลระบบ. */
adminConsoleRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        q: z.string().trim().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    const params: unknown[] = [];
    let where = '1 = 1';
    if (query.q !== undefined && query.q !== '') {
      where += ' AND (u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)';
      const like = `%${query.q}%`;
      params.push(like, like, like);
    }
    params.push(query.limit);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.name, u.phone, u.email, u.role, u.can_sell, u.can_buy, u.is_admin,
              u.created_at, bp.donor_tier, bp.org_status
       FROM users u
       LEFT JOIN buyer_profiles bp ON bp.user_id = u.id
       WHERE ${where}
       ORDER BY u.id DESC
       LIMIT ${query.limit}`,
      params,
    );
    res.json({
      users: rows.map((r) => ({
        id: n(r.id),
        name: String(r.name),
        phone: r.phone == null ? null : String(r.phone),
        email: r.email == null ? null : String(r.email),
        role: String(r.role),
        can_sell: n(r.can_sell) === 1,
        can_buy: n(r.can_buy) === 1,
        is_admin: n(r.is_admin) === 1,
        donor_tier: r.donor_tier == null ? null : String(r.donor_tier),
        org_status: r.org_status == null ? null : String(r.org_status),
        created_at: new Date(r.created_at as Date).toISOString(),
      })),
    });
  }),
);

/** Unlock an OTP-locked order by resetting otp_attempts to 0. */
adminConsoleRouter.post(
  '/orders/:id/unlock-otp',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, otp_attempts, status FROM orders WHERE id = ?`,
      [id],
    );
    const order = rows[0];
    if (order === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อ');
    }
    if (n(order.otp_attempts) < 5) {
      throw new HttpError(409, 'CONFLICT', 'ออเดอร์นี้ไม่ได้ถูกล็อก');
    }
    await pool.query(`UPDATE orders SET otp_attempts = 0 WHERE id = ?`, [id]);
    res.json({ ok: true, id, otp_attempts: 0 });
  }),
);

/** Merge source crop into target crop; re-points all lots and deletes source. */
adminConsoleRouter.post(
  '/crops/:id/merge',
  asyncHandler(async (req, res) => {
    const sourceId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({ target_id: z.number().int().positive() }).parse(req.body);
    if (sourceId === body.target_id) {
      throw new HttpError(400, 'VALIDATION', 'ต้นทางและปลายทางต้องไม่เป็นพืชเดียวกัน');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [source] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM crops WHERE id = ? FOR UPDATE`,
        [sourceId],
      );
      if (source.length === 0) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบพืชต้นทาง');
      const [target] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM crops WHERE id = ? FOR UPDATE`,
        [body.target_id],
      );
      if (target.length === 0) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบพืชปลายทาง');

      await conn.query(
        `UPDATE harvest_lots SET crop_id = ? WHERE crop_id = ?`,
        [body.target_id, sourceId],
      );
      await conn.query(`DELETE FROM crops WHERE id = ?`, [sourceId]);
      await conn.commit();
      res.json({ ok: true, merged_id: sourceId, target_id: body.target_id });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }),
);

function n(v: unknown): number {
  return Number(v ?? 0);
}

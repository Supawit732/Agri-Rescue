import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';
import { supportCreateRateLimit } from '../middleware/supportRateLimit';
import { notifyUser } from '../notifications/notificationService';
import { readPrivateUpload, savePrivateUpload } from '../storage/privateUploads';

export const supportRouter = Router();

const topicSchema = z.enum(['order_pickup', 'item_mismatch', 'account_login', 'donation', 'other']);
const statusSchema = z.enum(['open', 'in_progress', 'closed']);
const replyViaSchema = z.enum(['app', 'phone']);
const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.string().min(1).max(128),
  base64: z.string().min(1),
  original_name: z.string().max(255).optional(),
});

function ticketTopicLabel(topic: string): string {
  switch (topic) {
    case 'order_pickup':
      return 'คำสั่งซื้อ / รับของ';
    case 'item_mismatch':
      return 'ของไม่ตรงตามรูป';
    case 'account_login':
      return 'บัญชี / เข้าสู่ระบบ';
    case 'donation':
      return 'การบริจาค';
    default:
      return 'แนะนำ / อื่น ๆ';
  }
}

function presentTicket(row: RowDataPacket): Record<string, unknown> {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    topic: String(row.topic),
    topic_label: row.topic_label === null || row.topic_label === undefined
      ? ticketTopicLabel(String(row.topic))
      : String(row.topic_label),
    order_id: row.order_id === null || row.order_id === undefined ? null : Number(row.order_id),
    status: String(row.status),
    reply_via: String(row.reply_via),
    has_new_reply: Number(row.has_new_reply) === 1,
    created_at: new Date(row.created_at as Date).toISOString(),
    updated_at: new Date(row.updated_at as Date).toISOString(),
    user_name: row.user_name === undefined || row.user_name === null ? undefined : String(row.user_name),
    order_status: row.order_status === undefined || row.order_status === null ? undefined : String(row.order_status),
    order_summary:
      row.order_summary === undefined || row.order_summary === null ? undefined : String(row.order_summary),
  };
}

function presentMessage(row: RowDataPacket): Record<string, unknown> {
  let attachments: Array<{ id: number; original_name: string | null; mime: string }> = [];
  const raw = row.attachments_json;
  if (raw !== null && raw !== undefined && raw !== '') {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        attachments = parsed;
      }
    } catch {
      attachments = [];
    }
  }
  return {
    id: Number(row.id),
    ticket_id: Number(row.ticket_id),
    sender_role: String(row.sender_role),
    body: String(row.body),
    created_at: new Date(row.created_at as Date).toISOString(),
    attachments,
  };
}

supportRouter.use(requireAuth);

supportRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth?.id ?? 0;
    const isAdmin = req.auth?.is_admin === true;
    const query = z
      .object({
        status: statusSchema.optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        mine: z.enum(['1', '0']).optional(),
      })
      .parse(req.query);
    const limit = query.limit ?? 50;
    const statusFilter = query.status !== undefined ? ` AND t.status = ?` : '';
    const params: unknown[] = [];
    if (query.status !== undefined) {
      params.push(query.status);
    }

    let base: string;
    if (isAdmin && query.mine !== '1') {
      base = `FROM support_tickets t
              LEFT JOIN users u ON u.id = t.user_id
              LEFT JOIN orders o ON o.id = t.order_id
              LEFT JOIN harvest_lots h ON h.id = o.lot_id
              LEFT JOIN crops c ON c.id = h.crop_id
              WHERE 1 = 1${statusFilter}`;
    } else {
      base = `FROM support_tickets t
              LEFT JOIN users u ON u.id = t.user_id
              LEFT JOIN orders o ON o.id = t.order_id
              LEFT JOIN harvest_lots h ON h.id = o.lot_id
              LEFT JOIN crops c ON c.id = h.crop_id
              WHERE t.user_id = ?${statusFilter}`;
      params.unshift(userId);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT t.id, t.user_id, t.topic, t.topic_label, t.order_id, t.status, t.reply_via,
              t.has_new_reply, t.created_at, t.updated_at,
              u.name AS user_name,
              o.status AS order_status,
              CONCAT(COALESCE(c.name_th, ''), ' ', COALESCE(o.quantity_kg, ''), ' กก.') AS order_summary
       ${base}
       ORDER BY t.updated_at DESC, t.id DESC
       LIMIT ${limit}`,
      params,
    );

    let unreadCount = 0;
    if (isAdmin && query.mine !== '1') {
      const [cnt] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS c FROM support_tickets WHERE status <> 'closed'`,
      );
      // "ยังไม่ตอบ" = open with only user messages (or open/in_progress with has_new_reply from user)
      const [openCnt] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS c FROM support_tickets WHERE status = 'open'`,
      );
      unreadCount = Number(openCnt[0]?.c ?? 0);
      void cnt;
    }

    res.json({
      tickets: rows.map(presentTicket),
      unread_count: unreadCount,
    });
  }),
);

supportRouter.post(
  '/tickets',
  supportCreateRateLimit,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        topic: topicSchema,
        details: z.string().trim().min(1, 'กรุณากรอกรายละเอียด').max(1000, 'รายละเอียดยาวเกิน 1000 ตัวอักษร'),
        order_id: z.number().int().positive().nullable().optional(),
        reply_via: replyViaSchema.default('app'),
        attachments: z.array(attachmentSchema).max(3, 'แนบได้สูงสุด 3 รูป').optional(),
      })
      .parse(req.body);

    const userId = req.auth?.id ?? 0;
    if (body.order_id != null) {
      const [orders] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM orders WHERE id = ? AND (buyer_id = ? OR EXISTS (
            SELECT 1 FROM harvest_lots h JOIN plots p ON p.id = h.plot_id
            WHERE h.id = orders.lot_id AND p.farmer_id = ?
          ))`,
        [body.order_id, userId, userId],
      );
      if (orders[0] === undefined) {
        throw new HttpError(400, 'VALIDATION', 'ไม่พบคำสั่งซื้อที่เกี่ยวข้อง', {
          order_id: 'ไม่พบคำสั่งซื้อที่เกี่ยวข้อง',
        });
      }
    }

    const connection = await pool.getConnection();
    let ticketId = 0;
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO support_tickets (user_id, topic, topic_label, order_id, status, reply_via, has_new_reply, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'open', ?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [userId, body.topic, ticketTopicLabel(body.topic), body.order_id ?? null, body.reply_via],
      );
      ticketId = result.insertId;
      const [msg] = await connection.query<ResultSetHeader>(
        `INSERT INTO support_messages (ticket_id, sender_role, body, created_at)
         VALUES (?, 'user', ?, UTC_TIMESTAMP())`,
        [ticketId, body.details],
      );
      const attachments = body.attachments ?? [];
      for (const att of attachments) {
        const saved = await savePrivateUpload({
          userId,
          originalName: att.original_name ?? att.filename,
          mime: att.mime,
          base64: att.base64,
          supportImage: true,
        });
        await connection.query(
          `INSERT INTO support_attachments (ticket_id, message_id, stored_name, original_name, mime, size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
          [
            ticketId,
            msg.insertId,
            saved.storedName,
            att.original_name ?? att.filename,
            att.mime,
            saved.sizeBytes,
          ],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, topic, topic_label, order_id, status, reply_via, has_new_reply, created_at, updated_at
       FROM support_tickets WHERE id = ?`,
      [ticketId],
    );
    res.status(201).json({ ticket: presentTicket(rows[0]!) });
  }),
);

supportRouter.get(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const userId = req.auth?.id ?? 0;
    const isAdmin = req.auth?.is_admin === true;
    const [tickets] = await pool.query<RowDataPacket[]>(
      `SELECT t.id, t.user_id, t.topic, t.topic_label, t.order_id, t.status, t.reply_via,
              t.has_new_reply, t.created_at, t.updated_at,
              u.name AS user_name,
              o.status AS order_status,
              CONCAT(COALESCE(c.name_th, ''), ' ', COALESCE(o.quantity_kg, ''), ' กก.') AS order_summary
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN orders o ON o.id = t.order_id
       LEFT JOIN harvest_lots h ON h.id = o.lot_id
       LEFT JOIN crops c ON c.id = h.crop_id
       WHERE t.id = ?`,
      [id],
    );
    const ticket = tickets[0];
    if (ticket === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบเรื่อง');
    }
    if (!isAdmin && Number(ticket.user_id) !== userId) {
      throw new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูเรื่องนี้');
    }

    const [messages] = await pool.query<RowDataPacket[]>(
      `SELECT m.id, m.ticket_id, m.sender_role, m.body, m.created_at,
              COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'id', a.id,
                    'original_name', a.original_name,
                    'mime', a.mime
                  ))
                 FROM support_attachments a
                 WHERE a.message_id = m.id),
                JSON_ARRAY()
              ) AS attachments_json
       FROM support_messages m
       WHERE m.ticket_id = ?
       ORDER BY m.created_at ASC, m.id ASC`,
      [id],
    );

    if (!isAdmin && Number(ticket.user_id) === userId) {
      await pool.query(`UPDATE support_tickets SET has_new_reply = 0 WHERE id = ?`, [id]);
    }

    res.json({
      ticket: presentTicket(ticket),
      messages: messages.map(presentMessage),
    });
  }),
);

supportRouter.post(
  '/tickets/:id/messages',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z
      .object({
        body: z.string().trim().min(1, 'กรุณากรอกข้อความ').max(1000),
        attachments: z.array(attachmentSchema).max(3).optional(),
      })
      .parse(req.body);
    const userId = req.auth?.id ?? 0;
    const isAdmin = req.auth?.is_admin === true;
    const [tickets] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, status FROM support_tickets WHERE id = ?`,
      [id],
    );
    const ticket = tickets[0];
    if (ticket === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบเรื่อง');
    }
    if (!isAdmin && Number(ticket.user_id) !== userId) {
      throw new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ตอบเรื่องนี้');
    }
    if (String(ticket.status) === 'closed' && !isAdmin) {
      throw new HttpError(409, 'CONFLICT', 'ปิดเรื่องแล้ว ตอบเพิ่มไม่ได้');
    }

    const connection = await pool.getConnection();
    let newMessageId = 0;
    try {
      await connection.beginTransaction();
      const [msg] = await connection.query<ResultSetHeader>(
        `INSERT INTO support_messages (ticket_id, sender_role, body, created_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP())`,
        [id, isAdmin ? 'admin' : 'user', body.body],
      );
      newMessageId = msg.insertId;
      const attachments = body.attachments ?? [];
      for (const att of attachments) {
        const storedFor = isAdmin ? Number(ticket.user_id) : userId;
        const saved = await savePrivateUpload({
          userId: storedFor,
          originalName: att.original_name ?? att.filename,
          mime: att.mime,
          base64: att.base64,
          supportImage: true,
        });
        await connection.query(
          `INSERT INTO support_attachments (ticket_id, message_id, stored_name, original_name, mime, size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
          [id, newMessageId, saved.storedName, att.original_name ?? att.filename, att.mime, saved.sizeBytes],
        );
      }
      if (isAdmin) {
        await connection.query(
          `UPDATE support_tickets
           SET has_new_reply = 1,
               status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
               updated_at = UTC_TIMESTAMP()
           WHERE id = ?`,
          [id],
        );
      } else {
        await connection.query(
          `UPDATE support_tickets SET updated_at = UTC_TIMESTAMP() WHERE id = ?`,
          [id],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    if (isAdmin) {
      try {
        await notifyUser(
          Number(ticket.user_id),
          'support_reply',
          'notif.support_reply',
          { ticket_id: id },
          `/support/${id}`,
        );
      } catch {
        // notify must not fail reply
      }
    }

    const [messages] = await pool.query<RowDataPacket[]>(
      `SELECT m.id, m.ticket_id, m.sender_role, m.body, m.created_at,
              COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'id', a.id,
                    'original_name', a.original_name,
                    'mime', a.mime
                  ))
                 FROM support_attachments a
                 WHERE a.message_id = m.id),
                JSON_ARRAY()
              ) AS attachments_json
       FROM support_messages m
       WHERE m.ticket_id = ? AND m.id = ?`,
      [id, newMessageId],
    );
    res.status(201).json({ message: presentMessage(messages[0]!) });
  }),
);

supportRouter.patch(
  '/tickets/:id',
  requireCapability('admin'),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z
      .object({
        status: statusSchema.optional(),
        has_new_reply: z.boolean().optional(),
      })
      .refine((b) => b.status !== undefined || b.has_new_reply !== undefined, {
        message: 'ไม่มีข้อมูลที่จะอัปเดต',
      })
      .parse(req.body);
    const updates: string[] = [];
    const params: unknown[] = [];
    if (body.status !== undefined) {
      updates.push('status = ?');
      params.push(body.status);
      if (body.status === 'closed') {
        updates.push('has_new_reply = 0');
      }
    }
    if (body.has_new_reply !== undefined) {
      updates.push('has_new_reply = ?');
      params.push(body.has_new_reply ? 1 : 0);
    }
    updates.push('updated_at = UTC_TIMESTAMP()');
    params.push(id);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE support_tickets SET ${updates.join(', ')} WHERE id = ?`,
      params,
    );
    if (result.affectedRows === 0) {
      const [exists] = await pool.query<RowDataPacket[]>(`SELECT id FROM support_tickets WHERE id = ?`, [id]);
      if (exists.length === 0) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบเรื่อง');
      }
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, topic, topic_label, order_id, status, reply_via, has_new_reply, created_at, updated_at
       FROM support_tickets WHERE id = ?`,
      [id],
    );
    res.json({ ticket: presentTicket(rows[0]!) });
  }),
);

supportRouter.get(
  '/tickets/:id/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const attachmentId = z.coerce.number().int().positive().parse(req.params.attachmentId);
    const userId = req.auth?.id ?? 0;
    const isAdmin = req.auth?.is_admin === true;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT a.id, a.stored_name, a.original_name, a.mime, t.user_id
       FROM support_attachments a
       JOIN support_tickets t ON t.id = a.ticket_id
       WHERE a.ticket_id = ? AND a.id = ?`,
      [id, attachmentId],
    );
    const att = rows[0];
    if (att === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบไฟล์');
    }
    if (!isAdmin && Number(att.user_id) !== userId) {
      throw new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูไฟล์นี้');
    }
    const buffer = await readPrivateUpload(String(att.stored_name));
    res.setHeader('Content-Type', String(att.mime));
    res.setHeader('Content-Disposition', `inline; filename="${String(att.original_name ?? 'file')}"`);
    res.send(buffer);
  }),
);

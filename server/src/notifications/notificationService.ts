import type { PoolConnection } from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';

export type NotificationType =
  | 'shop_new_lot'
  | 'lot_booked'
  | 'order_delivered'
  | 'donor_review'
  | 'donor_proof_due'
  | 'support_reply';

export type NotificationParams = Record<string, string | number | boolean | null>;

export interface AppNotification {
  id: number;
  type: NotificationType | string;
  title_key: string;
  params: NotificationParams;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function parseParams(raw: unknown): NotificationParams {
  if (raw === null || raw === undefined || raw === '') {
    return {};
  }
  if (typeof raw === 'object') {
    return raw as NotificationParams;
  }
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as NotificationParams;
    }
  } catch {
    return {};
  }
  return {};
}

function toView(row: RowDataPacket): AppNotification {
  return {
    id: Number(row.id),
    type: String(row.type),
    title_key: String(row.title_key),
    params: parseParams(row.params_json),
    link: row.link === null || row.link === undefined ? null : String(row.link),
    read_at: row.read_at === null || row.read_at === undefined ? null : new Date(row.read_at as Date).toISOString(),
    created_at: new Date(row.created_at as Date).toISOString(),
  };
}

async function insertNotification(
  connection: PoolConnection,
  input: {
    userId: number;
    type: NotificationType;
    titleKey: string;
    params?: NotificationParams;
    link?: string | null;
  },
): Promise<void> {
  await connection.query(
    `INSERT INTO notifications (user_id, type, title_key, params_json, link, created_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [
      input.userId,
      input.type,
      input.titleKey,
      input.params !== undefined && Object.keys(input.params).length > 0
        ? JSON.stringify(input.params)
        : null,
      input.link ?? null,
    ],
  );
}

/** Fire-and-forget style helper for post-commit notifications. */
export async function notifyUser(
  userId: number,
  type: NotificationType,
  titleKey: string,
  params?: NotificationParams,
  link?: string | null,
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) {
    return;
  }
  const connection = await pool.getConnection();
  try {
    await insertNotification(connection, {
      userId,
      type,
      titleKey,
      ...(params !== undefined ? { params } : {}),
      link: link ?? null,
    });
  } finally {
    connection.release();
  }
}

export async function notifyMany(
  userIds: number[],
  type: NotificationType,
  titleKey: string,
  params?: NotificationParams,
  linkFor?: (userId: number) => string | null,
): Promise<void> {
  const unique = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) {
    return;
  }
  const connection = await pool.getConnection();
  try {
    for (const userId of unique) {
      await insertNotification(connection, {
        userId,
        type,
        titleKey,
        ...(params !== undefined ? { params } : {}),
        link: linkFor?.(userId) ?? null,
      });
    }
  } finally {
    connection.release();
  }
}

export async function listNotifications(
  userId: number,
  options: { filter?: 'all' | 'shop' | 'order'; limit?: number } = {},
): Promise<{ notifications: AppNotification[]; unread_count: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const filter = options.filter ?? 'all';
  const filterSql =
    filter === 'shop'
      ? ` AND type = 'shop_new_lot'`
      : filter === 'order'
        ? ` AND type IN ('lot_booked', 'order_delivered')`
        : '';
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, type, title_key, params_json, link, read_at, created_at
     FROM notifications
     WHERE user_id = ?${filterSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ${limit}`,
    [userId],
  );
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read_at IS NULL`,
    [userId],
  );
  return {
    notifications: rows.map(toView),
    unread_count: Number(countRows[0]?.cnt ?? 0),
  };
}

export async function unreadCount(userId: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read_at IS NULL`,
    [userId],
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function markNotificationRead(userId: number, id: number): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE notifications SET read_at = UTC_TIMESTAMP()
     WHERE id = ? AND user_id = ? AND read_at IS NULL`,
    [id, userId],
  );
  if (result.affectedRows > 0) {
    return true;
  }
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM notifications WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return existing.length > 0;
}

export async function markAllNotificationsRead(userId: number): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL`,
    [userId],
  );
  return result.affectedRows;
}

import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';

/**
 * One-off backfill of admin_audit_log from data that predates the activity log.
 * Idempotent: every inserted row carries metadata {backfilled, source, source_id} and a source
 * row that already has such a row is skipped.
 */

export interface BackfillCounts {
  orgReview: number;
  supportReply: number;
}

const ORG_ACTIONS: Record<string, { action: string; verb: string }> = {
  approved: { action: 'org.approve', verb: 'Approved' },
  rejected: { action: 'org.reject', verb: 'Rejected' },
  needs_more_info: { action: 'org.request_info', verb: 'Requested more info for' },
  checklist_saved: { action: 'org.checklist', verb: 'Saved checklist for' },
};

/** support_messages stores no admin id, so these rows are attributed to admin 0 ("unknown"). */
const UNKNOWN_ADMIN_ID = 0;

function notBackfilled(source: string, sourceIdColumn: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM admin_audit_log a
    WHERE JSON_UNQUOTE(JSON_EXTRACT(a.metadata_json, '$.source')) = '${source}'
      AND JSON_EXTRACT(a.metadata_json, '$.source_id') = ${sourceIdColumn}
  )`;
}

function parseJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function pendingOrgReviews(): Promise<RowDataPacket[]> {
  const actions = Object.keys(ORG_ACTIONS);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT l.id, l.user_id, l.admin_id, l.action, l.reason, l.requested_fields_json, l.created_at,
            COALESCE(bp.org_name, u.name) AS label
     FROM org_review_logs l
     LEFT JOIN users u ON u.id = l.user_id
     LEFT JOIN buyer_profiles bp ON bp.user_id = l.user_id
     WHERE l.action IN (${actions.map(() => '?').join(',')})
       AND ${notBackfilled('org_review_logs', 'l.id')}
     ORDER BY l.id`,
    actions,
  );
  return rows;
}

async function pendingSupportReplies(): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT m.id, m.ticket_id, m.body, m.created_at,
            (SELECT COUNT(*) FROM support_attachments s WHERE s.message_id = m.id) AS attachments
     FROM support_messages m
     WHERE m.sender_role = 'admin'
       AND ${notBackfilled('support_messages', 'm.id')}
     ORDER BY m.id`,
  );
  return rows;
}

async function insertRow(
  adminId: number,
  action: string,
  targetType: string,
  targetId: string,
  summary: string,
  metadata: Record<string, unknown>,
  createdAt: Date,
): Promise<void> {
  await pool.query(
    `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, summary, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [adminId, action, targetType, targetId, summary.slice(0, 512), JSON.stringify(metadata), createdAt],
  );
}

export async function backfillAuditLog(options: { dryRun: boolean }): Promise<BackfillCounts> {
  const reviews = await pendingOrgReviews();
  const replies = await pendingSupportReplies();

  if (!options.dryRun) {
    for (const r of reviews) {
      const mapped = ORG_ACTIONS[String(r.action)]!;
      const label = r.label == null ? null : String(r.label);
      const metadata: Record<string, unknown> = {
        backfilled: true,
        source: 'org_review_logs',
        source_id: Number(r.id),
        target_label: label,
      };
      if (r.action === 'rejected' || r.action === 'needs_more_info') {
        metadata.reason = r.reason == null ? null : String(r.reason);
        const fields = parseJson(r.requested_fields_json);
        if (Array.isArray(fields)) metadata.requested_fields = fields;
      }
      await insertRow(
        Number(r.admin_id),
        mapped.action,
        'org',
        String(r.user_id),
        `${mapped.verb} organization application ${label ?? `#${String(r.user_id)}`}`,
        metadata,
        r.created_at as Date,
      );
    }
    for (const m of replies) {
      await insertRow(
        UNKNOWN_ADMIN_ID,
        'support.reply',
        'support_ticket',
        String(m.ticket_id),
        `Replied to support ticket #${String(m.ticket_id)}`,
        {
          backfilled: true,
          source: 'support_messages',
          source_id: Number(m.id),
          message_id: Number(m.id),
          body_length: String(m.body).length,
          attachments: Number(m.attachments),
          admin_unknown: true,
        },
        m.created_at as Date,
      );
    }
  }

  return { orgReview: reviews.length, supportReply: replies.length };
}

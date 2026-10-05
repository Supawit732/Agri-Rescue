import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { backfillAuditLog } from '../../src/admin/auditBackfill';
import { nextPhone } from '../helpers';

async function insertUser(name: string, isAdmin: boolean): Promise<number> {
  const [res] = await pool.query<import('mysql2').ResultSetHeader>(
    `INSERT INTO users (name, phone, password_hash, role, can_sell, can_buy, is_admin)
     VALUES (?, ?, 'x', 'coordinator', 0, 0, ?)`,
    [name, nextPhone(), isAdmin ? 1 : 0],
  );
  return res.insertId;
}

async function auditRows(): Promise<RowDataPacket[]> {
  const [r] = await pool.query<RowDataPacket[]>('SELECT * FROM admin_audit_log ORDER BY id');
  return r;
}

describe('admin audit log backfill', () => {
  beforeEach(async () => {
    await pool.query('DELETE FROM admin_audit_log');
    await pool.query('DELETE FROM org_review_logs');
    await pool.query('DELETE FROM support_attachments');
    await pool.query('DELETE FROM support_messages');
    await pool.query('DELETE FROM support_tickets');
  });

  async function seed(): Promise<{ adminId: number; orgId: number; ticketId: number }> {
    const adminId = await insertUser('bf-admin', true);
    const orgId = await insertUser('bf-org', false);
    await pool.query(`INSERT INTO buyer_profiles (user_id, org_name) VALUES (?, 'มูลนิธิBackfill')
      ON DUPLICATE KEY UPDATE org_name = 'มูลนิธิBackfill'`, [orgId]);
    await pool.query(
      `INSERT INTO org_review_logs (user_id, admin_id, action, reason, requested_fields_json, created_at) VALUES
       (?, ?, 'needs_more_info', 'ขอเอกสาร', '["doc"]', '2026-02-01 09:00:00'),
       (?, ?, 'checklist_saved', NULL, NULL, '2026-02-02 09:00:00'),
       (?, ?, 'approved', NULL, NULL, '2026-02-03 09:00:00'),
       (?, ?, 'withdrawn', 'user withdrew', NULL, '2026-02-04 09:00:00')`,
      [orgId, adminId, orgId, adminId, orgId, adminId, orgId, adminId],
    );
    const [t] = await pool.query<import('mysql2').ResultSetHeader>(
      `INSERT INTO support_tickets (user_id, topic) VALUES (?, 'other')`,
      [orgId],
    );
    await pool.query(
      `INSERT INTO support_messages (ticket_id, sender_role, body, created_at) VALUES
       (?, 'user', 'help', '2026-03-01 08:00:00'),
       (?, 'admin', 'รับเรื่องแล้ว', '2026-03-01 09:00:00')`,
      [t.insertId, t.insertId],
    );
    return { adminId, orgId, ticketId: t.insertId };
  }

  it('dry run only counts', async () => {
    await seed();
    expect(await backfillAuditLog({ dryRun: true })).toEqual({ orgReview: 3, supportReply: 1 });
    expect(await auditRows()).toHaveLength(0);
  });

  it('backfills org reviews (skipping withdrawn) and admin support replies with original timestamps', async () => {
    const { adminId, orgId, ticketId } = await seed();
    expect(await backfillAuditLog({ dryRun: false })).toEqual({ orgReview: 3, supportReply: 1 });

    const log = await auditRows();
    expect(log.map((r) => r.action)).toEqual(['org.request_info', 'org.checklist', 'org.approve', 'support.reply']);
    expect(log[0]).toMatchObject({ admin_id: adminId, target_type: 'org', target_id: String(orgId) });
    expect(log[0]!.metadata_json).toMatchObject({
      backfilled: true,
      reason: 'ขอเอกสาร',
      requested_fields: ['doc'],
      target_label: 'มูลนิธิBackfill',
    });
    expect(new Date(log[0]!.created_at as Date).getTime()).toBe(
      new Date((await pool.query<RowDataPacket[]>('SELECT created_at FROM org_review_logs ORDER BY id LIMIT 1'))[0][0]!.created_at as Date).getTime(),
    );
    expect(log[3]).toMatchObject({ admin_id: 0, target_type: 'support_ticket', target_id: String(ticketId) });
    expect(log[3]!.metadata_json).toMatchObject({ backfilled: true, source: 'support_messages' });
  });

  it('is idempotent: a second run inserts nothing, new source rows are picked up', async () => {
    const { adminId, orgId } = await seed();
    await backfillAuditLog({ dryRun: false });
    expect(await backfillAuditLog({ dryRun: false })).toEqual({ orgReview: 0, supportReply: 0 });
    expect(await auditRows()).toHaveLength(4);

    await pool.query(
      `INSERT INTO org_review_logs (user_id, admin_id, action, reason) VALUES (?, ?, 'rejected', 'no')`,
      [orgId, adminId],
    );
    expect(await backfillAuditLog({ dryRun: false })).toEqual({ orgReview: 1, supportReply: 0 });
    expect(await auditRows()).toHaveLength(5);
  });
});

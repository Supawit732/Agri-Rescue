import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { assessRipenessFromPhoto } from '../ai/vision';
import { pool } from '../db/pool';
import { DONOR_CONFIG, ORG_REVIEW_QUICK_REASONS } from '../domain/donorRules';
import { unlockDonorSuspension, recordProofResult } from '../donors/donationService';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';
import { loadPublicUser } from './auth';
import { readPrivateUpload, savePrivateUpload } from '../storage/privateUploads';

export const donorsRouter = Router();

const orgTypeSchema = z.enum(['foundation', 'association', 'shelter', 'community_kitchen', 'other']);

const docSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  base64: z.string().min(1),
});

const becomeVolunteerSchema = z.object({
  distribution_mode: z.enum(['self_use', 'redistribute']).default('redistribute'),
});

const orgApplySchema = z.object({
  org_name: z.string().trim().min(1).max(255),
  org_type: orgTypeSchema,
  contact_name: z.string().trim().min(1).max(255),
  contact_title: z.string().trim().min(1).max(128),
  contact_phone: z.string().trim().regex(/^\d{9,15}$/, 'เบอร์โทรไม่ถูกต้อง'),
  org_lat: z.number().gte(-90).lte(90),
  org_lng: z.number().gte(-180).lte(180),
  beneficiary_count: z.number().int().positive(),
  distribution_mode: z.enum(['self_use', 'redistribute']),
  documents: z.array(docSchema).min(1).max(DONOR_CONFIG.orgDocMaxFiles),
});

const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'กรุณาระบุเหตุผล').max(512),
});

const addDocsSchema = z.object({
  documents: z.array(docSchema).min(1).max(DONOR_CONFIG.orgDocMaxFiles),
});

const proofSchema = z.object({
  image_base64: z.string().min(1),
  mime: z.enum(['image/jpeg', 'image/png']),
});

async function countOrgDocs(connection: PoolConnection, userId: number): Promise<number> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS c FROM org_application_docs WHERE user_id = ?',
    [userId],
  );
  return Number(rows[0]?.c ?? 0);
}

async function insertDocs(
  connection: PoolConnection,
  userId: number,
  documents: z.infer<typeof docSchema>[],
): Promise<void> {
  for (const doc of documents) {
    const saved = await savePrivateUpload({
      userId,
      originalName: doc.filename,
      mime: doc.mime,
      base64: doc.base64,
    });
    await connection.query(
      `INSERT INTO org_application_docs (user_id, stored_name, original_name, mime, size_bytes)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, saved.storedName, doc.filename, doc.mime, saved.sizeBytes],
    );
  }
}

async function writeReviewLog(
  connection: PoolConnection,
  input: { userId: number; adminId: number; action: 'approved' | 'rejected' | 'needs_more_info'; reason: string | null },
): Promise<void> {
  await connection.query(
    `INSERT INTO org_review_logs (user_id, admin_id, action, reason) VALUES (?, ?, ?, ?)`,
    [input.userId, input.adminId, input.action, input.reason],
  );
}

async function loadReviewLogs(userId: number): Promise<
  { id: number; admin_id: number; action: string; reason: string | null; created_at: string }[]
> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, admin_id, action, reason, created_at FROM org_review_logs WHERE user_id = ? ORDER BY id DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    admin_id: Number(row.admin_id),
    action: String(row.action),
    reason: row.reason === null ? null : String(row.reason),
    created_at: new Date(row.created_at as string).toISOString(),
  }));
}

donorsRouter.get(
  '/config',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({
      org_doc_max_files: DONOR_CONFIG.orgDocMaxFiles,
      org_doc_max_bytes: DONOR_CONFIG.orgDocMaxBytes,
      review_quick_reasons: ORG_REVIEW_QUICK_REASONS,
    });
  }),
);

donorsRouter.post(
  '/volunteer',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const body = becomeVolunteerSchema.parse(req.body ?? {});
    const userId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT user_id, donor_tier, org_status FROM buyer_profiles WHERE user_id = ? FOR UPDATE',
        [userId],
      );
      const profile = rows[0];
      if (profile === undefined) {
        await connection.query(
          `INSERT INTO buyer_profiles (user_id, buyer_type, charity_approved, donor_tier, distribution_mode, org_status)
           VALUES (?, 'vendor', 1, 'volunteer', ?, 'none')`,
          [userId, body.distribution_mode],
        );
      } else if (
        profile.donor_tier === 'verified_org' ||
        profile.org_status === 'pending' ||
        profile.org_status === 'needs_more_info'
      ) {
        throw new HttpError(409, 'CONFLICT', 'บัญชีนี้อยู่ในสถานะองค์กรแล้ว');
      } else if (profile.donor_tier !== 'trusted_volunteer' && profile.donor_tier !== 'volunteer') {
        await connection.query(
          `UPDATE buyer_profiles
           SET donor_tier = 'volunteer', distribution_mode = ?, donation_suspended = 0
           WHERE user_id = ?`,
          [body.distribution_mode, userId],
        );
      }
      await connection.query('UPDATE users SET can_buy = 1 WHERE id = ?', [userId]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.json({ user: await loadPublicUser(userId) });
  }),
);

donorsRouter.post(
  '/org-applications',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const body = orgApplySchema.parse(req.body);
    const userId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existing] = await connection.query<RowDataPacket[]>(
        'SELECT user_id, org_status, donor_tier FROM buyer_profiles WHERE user_id = ? FOR UPDATE',
        [userId],
      );
      const row = existing[0];
      if (row?.org_status === 'pending' || row?.org_status === 'needs_more_info') {
        throw new HttpError(409, 'CONFLICT', 'มีคำขอองค์กรที่ยังไม่ปิดอยู่แล้ว — ส่งเอกสารเพิ่มหรือรอตรวจ');
      }
      if (row?.donor_tier === 'verified_org' && row.org_status === 'approved') {
        throw new HttpError(409, 'CONFLICT', 'เป็นองค์กรที่ยืนยันแล้วอยู่แล้ว');
      }
      if (row === undefined) {
        await connection.query(
          `INSERT INTO buyer_profiles (
             user_id, buyer_type, charity_approved, donor_tier, beneficiary_count, distribution_mode,
             org_name, org_type, contact_name, contact_title, contact_phone, org_lat, org_lng, org_status
           ) VALUES (?, 'charity', 0, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [
            userId,
            body.beneficiary_count,
            body.distribution_mode,
            body.org_name,
            body.org_type,
            body.contact_name,
            body.contact_title,
            body.contact_phone,
            body.org_lat,
            body.org_lng,
          ],
        );
      } else {
        await connection.query(
          `UPDATE buyer_profiles SET
             buyer_type = 'charity', charity_approved = 0, donor_tier = NULL,
             beneficiary_count = ?, distribution_mode = ?,
             org_name = ?, org_type = ?, contact_name = ?, contact_title = ?, contact_phone = ?,
             org_lat = ?, org_lng = ?, org_status = 'pending', org_reject_reason = NULL, org_reviewed_at = NULL
           WHERE user_id = ?`,
          [
            body.beneficiary_count,
            body.distribution_mode,
            body.org_name,
            body.org_type,
            body.contact_name,
            body.contact_title,
            body.contact_phone,
            body.org_lat,
            body.org_lng,
            userId,
          ],
        );
        await connection.query('DELETE FROM org_application_docs WHERE user_id = ?', [userId]);
      }
      await insertDocs(connection, userId, body.documents);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.status(201).json({ user: await loadPublicUser(userId) });
  }),
);

donorsRouter.post(
  '/org-applications/documents',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const body = addDocsSchema.parse(req.body);
    const userId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT org_status FROM buyer_profiles WHERE user_id = ? FOR UPDATE',
        [userId],
      );
      const status = rows[0]?.org_status;
      if (status !== 'pending' && status !== 'needs_more_info') {
        throw new HttpError(409, 'CONFLICT', 'อัปโหลดเอกสารเพิ่มได้เฉพาะคำขอที่รอตรวจหรือขอเอกสารเพิ่ม');
      }
      const existing = await countOrgDocs(connection, userId);
      if (existing + body.documents.length > DONOR_CONFIG.orgDocMaxFiles) {
        throw new HttpError(
          400,
          'VALIDATION',
          `อัปโหลดได้สูงสุด ${DONOR_CONFIG.orgDocMaxFiles} ไฟล์ (มีอยู่แล้ว ${existing})`,
        );
      }
      await insertDocs(connection, userId, body.documents);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.status(201).json({ user: await loadPublicUser(userId) });
  }),
);

donorsRouter.post(
  '/org-applications/resubmit',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const userId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT org_status FROM buyer_profiles WHERE user_id = ? FOR UPDATE',
        [userId],
      );
      if (rows[0]?.org_status !== 'needs_more_info') {
        throw new HttpError(409, 'CONFLICT', 'ส่งตรวจอีกครั้งได้เมื่อสถานะเป็นขอเอกสารเพิ่มเท่านั้น');
      }
      const docs = await countOrgDocs(connection, userId);
      if (docs < 1) {
        throw new HttpError(400, 'VALIDATION', 'ต้องมีเอกสารอย่างน้อย 1 ไฟล์ก่อนส่งตรวจ');
      }
      await connection.query(
        `UPDATE buyer_profiles
         SET org_status = 'pending', org_reject_reason = NULL, org_reviewed_at = NULL
         WHERE user_id = ?`,
        [userId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.json({ user: await loadPublicUser(userId) });
  }),
);

donorsRouter.get(
  '/org-applications/mine',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const userId = req.auth?.id ?? 0;
    const [docs] = await pool.query<RowDataPacket[]>(
      `SELECT id, original_name, mime, size_bytes, created_at
       FROM org_application_docs WHERE user_id = ? ORDER BY id`,
      [userId],
    );
    res.json({
      user: await loadPublicUser(userId),
      documents: docs.map((doc) => ({
        id: Number(doc.id),
        original_name: String(doc.original_name),
        mime: String(doc.mime),
        size_bytes: Number(doc.size_bytes),
        created_at: new Date(doc.created_at as string).toISOString(),
      })),
      review_logs: await loadReviewLogs(userId),
    });
  }),
);

donorsRouter.get(
  '/admin/org-applications',
  requireAuth,
  requireCapability('admin'),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.name, u.phone, bp.org_name, bp.org_type, bp.contact_name, bp.contact_title,
              bp.contact_phone, bp.org_lat, bp.org_lng, bp.beneficiary_count, bp.distribution_mode,
              bp.org_status, bp.org_reject_reason, bp.created_at
       FROM buyer_profiles bp
       JOIN users u ON u.id = bp.user_id
       WHERE bp.org_status IN ('pending', 'needs_more_info')
       ORDER BY bp.created_at ASC, u.id ASC`,
    );
    const apps = [];
    for (const row of rows) {
      const [docs] = await pool.query<RowDataPacket[]>(
        `SELECT id, original_name, mime, size_bytes, created_at
         FROM org_application_docs WHERE user_id = ? ORDER BY id`,
        [row.id],
      );
      apps.push({
        user_id: Number(row.id),
        name: String(row.name),
        phone: String(row.phone),
        org_name: String(row.org_name),
        org_type: String(row.org_type),
        contact_name: String(row.contact_name),
        contact_title: String(row.contact_title),
        contact_phone: String(row.contact_phone),
        org_lat: Number(row.org_lat),
        org_lng: Number(row.org_lng),
        beneficiary_count: Number(row.beneficiary_count),
        distribution_mode: String(row.distribution_mode),
        org_status: String(row.org_status),
        org_reject_reason: row.org_reject_reason === null ? null : String(row.org_reject_reason),
        created_at: new Date(row.created_at as string).toISOString(),
        documents: docs.map((doc) => ({
          id: Number(doc.id),
          original_name: String(doc.original_name),
          mime: String(doc.mime),
          size_bytes: Number(doc.size_bytes),
          created_at: new Date(doc.created_at as string).toISOString(),
        })),
        review_logs: await loadReviewLogs(Number(row.id)),
      });
    }
    res.json({ applications: apps, review_quick_reasons: ORG_REVIEW_QUICK_REASONS });
  }),
);

donorsRouter.post(
  '/admin/org-applications/:userId/approve',
  requireAuth,
  requireCapability('admin'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const adminId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE buyer_profiles
         SET org_status = 'approved', charity_approved = 1, donor_tier = 'verified_org',
             org_reject_reason = NULL, org_reviewed_at = UTC_TIMESTAMP()
         WHERE user_id = ? AND org_status = 'pending'`,
        [userId],
      );
      if (result.affectedRows === 0) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอองค์กรที่รออนุมัติ');
      }
      await writeReviewLog(connection, { userId, adminId, action: 'approved', reason: null });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.json({ user: await loadPublicUser(userId) });
  }),
);

donorsRouter.post(
  '/admin/org-applications/:userId/reject',
  requireAuth,
  requireCapability('admin'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const adminId = req.auth?.id ?? 0;
    const body = reasonSchema.parse(req.body ?? {});
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE buyer_profiles
         SET org_status = 'rejected', charity_approved = 0, donor_tier = NULL,
             org_reject_reason = ?, org_reviewed_at = UTC_TIMESTAMP()
         WHERE user_id = ? AND org_status IN ('pending', 'needs_more_info')`,
        [body.reason, userId],
      );
      if (result.affectedRows === 0) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอองค์กรที่รอตรวจ');
      }
      await writeReviewLog(connection, { userId, adminId, action: 'rejected', reason: body.reason });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.json({ user: await loadPublicUser(userId) });
  }),
);

donorsRouter.post(
  '/admin/org-applications/:userId/needs-more-info',
  requireAuth,
  requireCapability('admin'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const adminId = req.auth?.id ?? 0;
    const body = reasonSchema.parse(req.body ?? {});
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE buyer_profiles
         SET org_status = 'needs_more_info', charity_approved = 0, donor_tier = NULL,
             org_reject_reason = ?, org_reviewed_at = UTC_TIMESTAMP()
         WHERE user_id = ? AND org_status = 'pending'`,
        [body.reason, userId],
      );
      if (result.affectedRows === 0) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอองค์กรที่รออนุมัติ');
      }
      await writeReviewLog(connection, {
        userId,
        adminId,
        action: 'needs_more_info',
        reason: body.reason,
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.json({ user: await loadPublicUser(userId) });
  }),
);

donorsRouter.get(
  '/admin/org-docs/:docId',
  requireAuth,
  requireCapability('admin'),
  asyncHandler(async (req, res) => {
    const docId = Number(req.params.docId);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, stored_name, original_name, mime FROM org_application_docs WHERE id = ?',
      [docId],
    );
    const doc = rows[0];
    if (doc === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบเอกสาร');
    }
    const buffer = await readPrivateUpload(String(doc.stored_name));
    res.setHeader('Content-Type', String(doc.mime));
    res.setHeader('Content-Disposition', `attachment; filename="${String(doc.original_name).replace(/"/g, '')}"`);
    res.send(buffer);
  }),
);

donorsRouter.get(
  '/admin/donors/:userId/proofs',
  requireAuth,
  requireCapability('admin'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT dp.id, dp.order_id, dp.due_at, dp.submitted_at, dp.subject_match, dp.status, dp.created_at
       FROM donation_proofs dp
       JOIN orders o ON o.id = dp.order_id
       WHERE o.buyer_id = ?
       ORDER BY dp.id DESC`,
      [userId],
    );
    res.json({
      proofs: rows.map((row) => ({
        id: Number(row.id),
        order_id: Number(row.order_id),
        due_at: new Date(row.due_at as string).toISOString(),
        submitted_at: row.submitted_at === null ? null : new Date(row.submitted_at as string).toISOString(),
        subject_match: row.subject_match === null ? null : Number(row.subject_match) === 1,
        status: row.status,
        created_at: new Date(row.created_at as string).toISOString(),
      })),
    });
  }),
);

donorsRouter.post(
  '/admin/donors/:userId/unlock',
  requireAuth,
  requireCapability('admin'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    await unlockDonorSuspension(userId);
    res.json({ user: await loadPublicUser(userId) });
  }),
);

donorsRouter.post(
  '/orders/:orderId/proof',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const orderId = Number(req.params.orderId);
    const body = proofSchema.parse(req.body);
    const userId = req.auth?.id ?? 0;
    const [orders] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.buyer_id, o.is_donation, o.status, c.name_th AS crop_name_th
       FROM orders o
       JOIN harvest_lots h ON h.id = o.lot_id
       JOIN crops c ON c.id = h.crop_id
       WHERE o.id = ?`,
      [orderId],
    );
    const order = orders[0];
    if (order === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อ');
    }
    if (Number(order.buyer_id) !== userId) {
      throw new HttpError(403, 'FORBIDDEN', 'ส่งรูปได้เฉพาะคำสั่งของตนเอง');
    }
    if (Number(order.is_donation) !== 1 || order.status !== 'delivered') {
      throw new HttpError(409, 'CONFLICT', 'ส่งรูปยืนยันได้หลังรับบริจาคสำเร็จเท่านั้น');
    }
    const [proofs] = await pool.query<RowDataPacket[]>(
      `SELECT id, status FROM donation_proofs WHERE order_id = ?`,
      [orderId],
    );
    const proof = proofs[0];
    if (proof === undefined || proof.status !== 'pending') {
      throw new HttpError(409, 'CONFLICT', 'ไม่มีคำขอรูปยืนยันที่รอส่ง');
    }
    const vision = await assessRipenessFromPhoto({
      cropNameTh: String(order.crop_name_th),
      imageBase64: body.image_base64,
      mime: body.mime,
    });
    if (!vision.available) {
      throw new HttpError(503, 'AI_UNAVAILABLE', 'ประเมินรูปไม่สำเร็จ กรุณาลองใหม่');
    }
    const saved = await savePrivateUpload({
      userId,
      originalName: `proof-${orderId}.jpg`,
      mime: body.mime,
      base64: body.image_base64,
    });
    const result = await recordProofResult({
      userId,
      orderId,
      subjectMatch: vision.subject_match === true,
      storedName: saved.storedName,
    });
    res.json({
      subject_match: vision.subject_match === true,
      promoted: result.promoted,
      suspended: result.suspended,
      user: await loadPublicUser(userId),
    });
  }),
);

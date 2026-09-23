import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { assessRipenessFromPhoto } from '../ai/vision';
import { pool } from '../db/pool';
import { DONOR_CONFIG, ORG_REVIEW_QUICK_REASONS } from '../domain/donorRules';
import { DONOR_TERMS_TITLE, DONOR_TERMS_VERSION } from '../domain/donorTerms';
import { unlockDonorSuspension, recordProofResult } from '../donors/donationService';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';
import { loadPublicUser } from './auth';
import { readPrivateUpload, savePrivateUpload } from '../storage/privateUploads';

export const donorsRouter = Router();

const orgTypeSchema = z.enum([
  'foundation',
  'association',
  'shelter',
  'community_kitchen',
  'community_enterprise',
  'other',
]);

const docCategorySchema = z.enum(['registration_cert', 'community_cert', 'site_photo', 'other']);

const docSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  base64: z.string().min(1),
  doc_category: docCategorySchema.default('other'),
});

const recipientGroupSchema = z.enum(['elderly', 'children', 'community', 'temple', 'other']);

const becomeVolunteerSchema = z.object({
  distribution_mode: z.enum(['self_use', 'redistribute']).default('redistribute'),
});

const phoneSchema = z.string().trim().regex(/^\d{9,15}$/, 'เบอร์โทรไม่ถูกต้อง');
const emailSchema = z.string().trim().email('อีเมลไม่ถูกต้อง').max(255).optional().nullable();

const draftSchema = z.object({
  application_kind: z.enum(['individual', 'organization']).optional().nullable(),
  draft_step: z.number().int().min(0).max(20).optional().nullable(),
  org_name: z.string().trim().max(255).optional().nullable(),
  org_type: orgTypeSchema.optional().nullable(),
  registered: z.boolean().optional().nullable(),
  registration_number: z.string().trim().max(64).optional().nullable(),
  registered_address: z.string().trim().max(512).optional().nullable(),
  contact_name: z.string().trim().max(255).optional().nullable(),
  contact_title: z.string().trim().max(128).optional().nullable(),
  contact_phone: z.string().trim().max(32).optional().nullable(),
  contact_email: z.string().trim().max(255).optional().nullable(),
  org_lat: z.number().gte(-90).lte(90).optional().nullable(),
  org_lng: z.number().gte(-180).lte(180).optional().nullable(),
  beneficiary_count: z.number().int().positive().optional().nullable(),
  recipient_groups: z.array(recipientGroupSchema).optional().nullable(),
  purpose_th: z.string().trim().max(512).optional().nullable(),
  distribution_mode: z.enum(['self_use', 'redistribute']).optional().nullable(),
  redistribute_place: z.string().trim().max(512).optional().nullable(),
  redistribute_frequency: z.string().trim().max(128).optional().nullable(),
  documents: z.array(docSchema).max(DONOR_CONFIG.orgDocMaxFiles).optional(),
  replace_documents: z.boolean().optional(),
});

const orgApplyBase = z.object({
  application_kind: z.enum(['individual', 'organization']),
  terms_version: z.string().min(1),
  terms_accepted: z.literal(true, { message: 'ต้องยอมรับข้อกำหนดก่อนส่งคำขอ' }),
  contact_name: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(255),
  contact_phone: phoneSchema,
  contact_email: emailSchema,
  org_lat: z.number().gte(-90).lte(90),
  org_lng: z.number().gte(-180).lte(180),
  recipient_groups: z.array(recipientGroupSchema).min(1, 'เลือกอย่างน้อยหนึ่งกลุ่มผู้รับ'),
  purpose_th: z.string().trim().min(1, 'กรุณาระบุวัตถุประสงค์').max(512).optional(),
  // Org-only (validated in superRefine)
  org_name: z.string().trim().max(255).optional(),
  org_type: orgTypeSchema.optional(),
  registered: z.boolean().optional(),
  registration_number: z.string().trim().max(64).optional().nullable(),
  registered_address: z.string().trim().max(512).optional(),
  contact_title: z.string().trim().max(128).optional(),
  beneficiary_count: z.number().int().positive().optional(),
  distribution_mode: z.enum(['self_use', 'redistribute']).optional(),
  redistribute_place: z.string().trim().max(512).optional().nullable(),
  redistribute_frequency: z.string().trim().max(128).optional().nullable(),
  documents: z.array(docSchema).max(DONOR_CONFIG.orgDocMaxFiles).optional(),
});

const orgApplySchema = orgApplyBase.superRefine((body, ctx) => {
  if (body.terms_version !== DONOR_TERMS_VERSION) {
    ctx.addIssue({
      code: 'custom',
      message: 'กรุณายอมรับข้อกำหนดฉบับล่าสุด',
      path: ['terms_version'],
    });
  }
  if (body.application_kind === 'individual') {
    if (body.purpose_th === undefined || body.purpose_th.trim() === '') {
      ctx.addIssue({ code: 'custom', message: 'กรุณาระบุวัตถุประสงค์', path: ['purpose_th'] });
    }
    return;
  }
  // organization
  if (body.org_name === undefined || body.org_name.trim() === '') {
    ctx.addIssue({ code: 'custom', message: 'กรุณากรอกชื่อองค์กร', path: ['org_name'] });
  }
  if (body.org_type === undefined) {
    ctx.addIssue({ code: 'custom', message: 'กรุณาเลือกประเภทองค์กร', path: ['org_type'] });
  }
  if (body.registered === undefined) {
    ctx.addIssue({ code: 'custom', message: 'กรุณาระบุว่าจดทะเบียนหรือไม่', path: ['registered'] });
  }
  if (body.registered_address === undefined || body.registered_address.trim() === '') {
    ctx.addIssue({ code: 'custom', message: 'กรุณากรอกที่อยู่ตามทะเบียน', path: ['registered_address'] });
  }
  if (body.contact_title === undefined || body.contact_title.trim() === '') {
    ctx.addIssue({ code: 'custom', message: 'กรุณากรอกตำแหน่งผู้ติดต่อ', path: ['contact_title'] });
  }
  if (body.beneficiary_count === undefined) {
    ctx.addIssue({ code: 'custom', message: 'กรุณาระบุจำนวนผู้รับประโยชน์', path: ['beneficiary_count'] });
  }
  if (body.distribution_mode === undefined) {
    ctx.addIssue({ code: 'custom', message: 'กรุณาเลือกรูปแบบการแจกจ่าย', path: ['distribution_mode'] });
  }
  if (body.distribution_mode === 'redistribute') {
    if (body.redistribute_place === undefined || body.redistribute_place === null || body.redistribute_place.trim() === '') {
      ctx.addIssue({ code: 'custom', message: 'กรุณาระบุสถานที่แจกประจำ', path: ['redistribute_place'] });
    }
    if (
      body.redistribute_frequency === undefined ||
      body.redistribute_frequency === null ||
      body.redistribute_frequency.trim() === ''
    ) {
      ctx.addIssue({ code: 'custom', message: 'กรุณาระบุความถี่การแจก', path: ['redistribute_frequency'] });
    }
  }
  const docs = body.documents ?? [];
  if (docs.length === 0) {
    // Allow empty when documents already stored on the open application; route validates DB.
    return;
  }
  const certs = docs.filter((d) => d.doc_category === 'registration_cert' || d.doc_category === 'community_cert');
  const photos = docs.filter((d) => d.doc_category === 'site_photo');
  if (certs.length < 1) {
    ctx.addIssue({
      code: 'custom',
      message: 'ต้องแนบหนังสือรับรองการจดทะเบียนหรือหนังสือรับรองจากชุมชนอย่างน้อย 1 ไฟล์',
      path: ['documents'],
    });
  }
  if (photos.length < 1 || photos.length > 3) {
    ctx.addIssue({
      code: 'custom',
      message: 'ต้องแนบรูปสถานที่ 1–3 รูป',
      path: ['documents'],
    });
  }
});

const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'กรุณาระบุเหตุผล').max(512),
  requested_fields: z.array(z.string().trim().min(1).max(64)).max(40).optional(),
});

const checklistSchema = z.object({
  checklist: z.object({
    name_matches_docs: z.boolean(),
    location_matches_photos: z.boolean(),
    docs_not_expired: z.boolean(),
  }),
});

const addDocsSchema = z.object({
  documents: z.array(docSchema).min(1).max(DONOR_CONFIG.orgDocMaxFiles),
});

const proofSchema = z.object({
  image_base64: z.string().min(1),
  mime: z.enum(['image/jpeg', 'image/png']),
});

type DocInput = z.infer<typeof docSchema>;

function parseJsonArray(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === '') {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

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
  documents: DocInput[],
): Promise<void> {
  for (const doc of documents) {
    const saved = await savePrivateUpload({
      userId,
      originalName: doc.filename,
      mime: doc.mime,
      base64: doc.base64,
    });
    await connection.query(
      `INSERT INTO org_application_docs (user_id, stored_name, original_name, mime, doc_category, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, saved.storedName, doc.filename, doc.mime, doc.doc_category, saved.sizeBytes],
    );
  }
}

async function writeReviewLog(
  connection: PoolConnection,
  input: {
    userId: number;
    adminId: number;
    action: 'approved' | 'rejected' | 'needs_more_info' | 'checklist_saved' | 'withdrawn';
    reason: string | null;
    checklistJson?: string | null;
    requestedFieldsJson?: string | null;
  },
): Promise<void> {
  await connection.query(
    `INSERT INTO org_review_logs (user_id, admin_id, action, reason, checklist_json, requested_fields_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.adminId,
      input.action,
      input.reason,
      input.checklistJson ?? null,
      input.requestedFieldsJson ?? null,
    ],
  );
}

function throwOpenApplicationConflict(row: {
  user_id: number | string;
  org_status: unknown;
  application_kind?: unknown;
}): never {
  throw new HttpError(409, 'CONFLICT', 'มีคำขอที่ยังไม่ปิด', undefined, {
    existing_id: Number(row.user_id),
    org_status: String(row.org_status),
    application_kind:
      row.application_kind === null || row.application_kind === undefined
        ? null
        : String(row.application_kind),
  });
}

function isOpenApplicationStatus(status: unknown): boolean {
  return status === 'draft' || status === 'pending' || status === 'needs_more_info';
}

type ReviewLog = {
  id: number;
  admin_id: number;
  action: string;
  reason: string | null;
  checklist: Record<string, unknown> | null;
  requested_fields: string[];
  created_at: string;
};

async function loadReviewLogs(userId: number): Promise<ReviewLog[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, admin_id, action, reason, checklist_json, requested_fields_json, created_at
     FROM org_review_logs WHERE user_id = ? ORDER BY id DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    admin_id: Number(row.admin_id),
    action: String(row.action),
    reason: row.reason === null ? null : String(row.reason),
    checklist: parseJsonObject(row.checklist_json),
    requested_fields: parseJsonArray(row.requested_fields_json),
    created_at: new Date(row.created_at as string).toISOString(),
  }));
}

type DocRow = {
  id: number;
  original_name: string;
  mime: string;
  size_bytes: number;
  doc_category: string;
  created_at: string;
};

async function loadDocs(userId: number): Promise<DocRow[]> {
  const [docs] = await pool.query<RowDataPacket[]>(
    `SELECT id, original_name, mime, size_bytes, doc_category, created_at
     FROM org_application_docs WHERE user_id = ? ORDER BY id`,
    [userId],
  );
  return docs.map((doc) => ({
    id: Number(doc.id),
    original_name: String(doc.original_name),
    mime: String(doc.mime),
    size_bytes: Number(doc.size_bytes),
    doc_category: String(doc.doc_category ?? 'other'),
    created_at: new Date(doc.created_at as string).toISOString(),
  }));
}

function groupDocsByCategory(docs: DocRow[]): Record<string, DocRow[]> {
  const groups: Record<string, DocRow[]> = {
    registration_cert: [],
    community_cert: [],
    site_photo: [],
    other: [],
  };
  for (const doc of docs) {
    const key = groups[doc.doc_category] !== undefined ? doc.doc_category : 'other';
    groups[key]!.push(doc);
  }
  return groups;
}

function applicationSections(row: RowDataPacket): {
  kind: string | null;
  individual: Record<string, unknown> | null;
  organization: Record<string, unknown> | null;
  contact: Record<string, unknown>;
  beneficiaries: Record<string, unknown>;
} {
  const kind = row.application_kind === null || row.application_kind === undefined ? null : String(row.application_kind);
  const contact = {
    contact_name: row.contact_name === null ? null : String(row.contact_name),
    contact_title: row.contact_title === null ? null : String(row.contact_title),
    contact_phone: row.contact_phone === null ? null : String(row.contact_phone),
    contact_email: row.contact_email === null ? null : String(row.contact_email),
  };
  const beneficiaries = {
    beneficiary_count: row.beneficiary_count === null ? null : Number(row.beneficiary_count),
    recipient_groups: parseJsonArray(row.recipient_groups_json),
    distribution_mode: row.distribution_mode === null ? null : String(row.distribution_mode),
    redistribute_place: row.redistribute_place === null ? null : String(row.redistribute_place),
    redistribute_frequency: row.redistribute_frequency === null ? null : String(row.redistribute_frequency),
    purpose_th: row.purpose_th === null ? null : String(row.purpose_th),
  };
  if (kind === 'individual') {
    return {
      kind,
      individual: {
        contact_name: contact.contact_name,
        contact_phone: contact.contact_phone,
        contact_email: contact.contact_email,
        org_lat: row.org_lat === null ? null : Number(row.org_lat),
        org_lng: row.org_lng === null ? null : Number(row.org_lng),
        recipient_groups: beneficiaries.recipient_groups,
        purpose_th: beneficiaries.purpose_th,
      },
      organization: null,
      contact,
      beneficiaries,
    };
  }
  return {
    kind,
    individual: null,
    organization: {
      org_name: row.org_name === null ? null : String(row.org_name),
      org_type: row.org_type === null ? null : String(row.org_type),
      registered: row.registered === null || row.registered === undefined ? null : Number(row.registered) === 1,
      registration_number: row.registration_number === null ? null : String(row.registration_number),
      registered_address: row.registered_address === null ? null : String(row.registered_address),
      org_lat: row.org_lat === null ? null : Number(row.org_lat),
      org_lng: row.org_lng === null ? null : Number(row.org_lng),
    },
    contact,
    beneficiaries,
  };
}

donorsRouter.get(
  '/terms',
  asyncHandler(async (_req, res) => {
    res.json({ version: DONOR_TERMS_VERSION, title: DONOR_TERMS_TITLE });
  }),
);

donorsRouter.get(
  '/config',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({
      org_doc_max_files: DONOR_CONFIG.orgDocMaxFiles,
      org_doc_max_bytes: DONOR_CONFIG.orgDocMaxBytes,
      review_quick_reasons: ORG_REVIEW_QUICK_REASONS,
      terms_version: DONOR_TERMS_VERSION,
      terms_title: DONOR_TERMS_TITLE,
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
      } else if (profile.donor_tier === 'verified_org') {
        throw new HttpError(409, 'CONFLICT', 'เป็นองค์กรที่ยืนยันแล้วอยู่แล้ว', undefined, {
          existing_id: userId,
          org_status: 'approved',
          application_kind: 'organization',
        });
      } else if (isOpenApplicationStatus(profile.org_status)) {
        throwOpenApplicationConflict({
          user_id: userId,
          org_status: profile.org_status,
          application_kind: null,
        });
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
  '/org-applications/draft',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const body = draftSchema.parse(req.body ?? {});
    const userId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existing] = await connection.query<RowDataPacket[]>(
        'SELECT user_id, org_status, donor_tier, application_kind FROM buyer_profiles WHERE user_id = ? FOR UPDATE',
        [userId],
      );
      const row = existing[0];
      // Allow editing open applications (draft / pending / needs_more_info); block closed approved verified_org.
      if (row?.donor_tier === 'verified_org' && row.org_status === 'approved') {
        throw new HttpError(409, 'CONFLICT', 'เป็นองค์กรที่ยืนยันแล้วอยู่แล้ว');
      }
      const recipientJson =
        body.recipient_groups === undefined || body.recipient_groups === null
          ? null
          : JSON.stringify(body.recipient_groups);
      const registeredVal =
        body.registered === undefined || body.registered === null ? null : body.registered ? 1 : 0;

      if (row === undefined) {
        await connection.query(
          `INSERT INTO buyer_profiles (
             user_id, buyer_type, charity_approved, donor_tier, org_status, application_kind, draft_step,
             org_name, org_type, registered, registration_number, registered_address,
             contact_name, contact_title, contact_phone, contact_email, org_lat, org_lng,
             beneficiary_count, recipient_groups_json, purpose_th, distribution_mode,
             redistribute_place, redistribute_frequency
           ) VALUES (?, 'charity', 0, NULL, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            body.application_kind ?? null,
            body.draft_step ?? 0,
            body.org_name ?? null,
            body.org_type ?? null,
            registeredVal,
            body.registration_number ?? null,
            body.registered_address ?? null,
            body.contact_name ?? null,
            body.contact_title ?? null,
            body.contact_phone ?? null,
            body.contact_email ?? null,
            body.org_lat ?? null,
            body.org_lng ?? null,
            body.beneficiary_count ?? null,
            recipientJson,
            body.purpose_th ?? null,
            body.distribution_mode ?? null,
            body.redistribute_place ?? null,
            body.redistribute_frequency ?? null,
          ],
        );
      } else {
        if (row.org_status === 'approved') {
          throw new HttpError(409, 'CONFLICT', 'บัญชีนี้พร้อมรับบริจาคแล้ว');
        }
        const nextStatus =
          row.org_status === 'needs_more_info'
            ? 'needs_more_info'
            : row.org_status === 'pending'
              ? 'pending'
              : 'draft';
        await connection.query(
          `UPDATE buyer_profiles SET
             buyer_type = 'charity', charity_approved = 0,
             donor_tier = CASE WHEN ? IN ('needs_more_info', 'pending') THEN donor_tier ELSE NULL END,
             org_status = ?,
             application_kind = COALESCE(?, application_kind),
             draft_step = COALESCE(?, draft_step),
             org_name = COALESCE(?, org_name),
             org_type = COALESCE(?, org_type),
             registered = COALESCE(?, registered),
             registration_number = COALESCE(?, registration_number),
             registered_address = COALESCE(?, registered_address),
             contact_name = COALESCE(?, contact_name),
             contact_title = COALESCE(?, contact_title),
             contact_phone = COALESCE(?, contact_phone),
             contact_email = COALESCE(?, contact_email),
             org_lat = COALESCE(?, org_lat),
             org_lng = COALESCE(?, org_lng),
             beneficiary_count = COALESCE(?, beneficiary_count),
             recipient_groups_json = COALESCE(?, recipient_groups_json),
             purpose_th = COALESCE(?, purpose_th),
             distribution_mode = COALESCE(?, distribution_mode),
             redistribute_place = COALESCE(?, redistribute_place),
             redistribute_frequency = COALESCE(?, redistribute_frequency)
           WHERE user_id = ?`,
          [
            nextStatus,
            nextStatus,
            body.application_kind ?? null,
            body.draft_step ?? null,
            body.org_name ?? null,
            body.org_type ?? null,
            registeredVal,
            body.registration_number ?? null,
            body.registered_address ?? null,
            body.contact_name ?? null,
            body.contact_title ?? null,
            body.contact_phone ?? null,
            body.contact_email ?? null,
            body.org_lat ?? null,
            body.org_lng ?? null,
            body.beneficiary_count ?? null,
            recipientJson,
            body.purpose_th ?? null,
            body.distribution_mode ?? null,
            body.redistribute_place ?? null,
            body.redistribute_frequency ?? null,
            userId,
          ],
        );
      }

      if (body.replace_documents === true) {
        await connection.query('DELETE FROM org_application_docs WHERE user_id = ?', [userId]);
      }
      if (body.documents !== undefined && body.documents.length > 0) {
        const existingCount = await countOrgDocs(connection, userId);
        if (existingCount + body.documents.length > DONOR_CONFIG.orgDocMaxFiles) {
          throw new HttpError(400, 'VALIDATION', `อัปโหลดได้สูงสุด ${DONOR_CONFIG.orgDocMaxFiles} ไฟล์`);
        }
        await insertDocs(connection, userId, body.documents);
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
    const isIndividual = body.application_kind === 'individual';
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existing] = await connection.query<RowDataPacket[]>(
        'SELECT user_id, org_status, donor_tier, application_kind FROM buyer_profiles WHERE user_id = ? FOR UPDATE',
        [userId],
      );
      const row = existing[0];
      if (row !== undefined && (row.org_status === 'pending' || row.org_status === 'needs_more_info')) {
        throwOpenApplicationConflict({
          user_id: Number(row.user_id),
          org_status: row.org_status,
          application_kind: row.application_kind,
        });
      }
      if (row?.donor_tier === 'verified_org' && row.org_status === 'approved') {
        throw new HttpError(409, 'CONFLICT', 'เป็นองค์กรที่ยืนยันแล้วอยู่แล้ว', undefined, {
          existing_id: Number(row.user_id),
          org_status: 'approved',
          application_kind: 'organization',
        });
      }

      const recipientJson = JSON.stringify(body.recipient_groups);
      const orgStatus = isIndividual ? 'approved' : 'pending';
      const donorTier = isIndividual ? 'volunteer' : null;
      const charityApproved = 0;
      const distributionMode = isIndividual ? 'redistribute' : (body.distribution_mode ?? 'redistribute');
      const orgName = body.org_name ?? (isIndividual ? body.contact_name : null);
      const registeredVal = body.registered === undefined ? null : body.registered ? 1 : 0;

      const profileFields = [
        charityApproved,
        donorTier,
        body.beneficiary_count ?? null,
        distributionMode,
        orgName,
        body.org_type ?? null,
        registeredVal,
        body.registration_number ?? null,
        body.registered_address ?? null,
        body.contact_name,
        body.contact_title ?? null,
        body.contact_phone,
        body.contact_email ?? null,
        body.org_lat,
        body.org_lng,
        recipientJson,
        body.purpose_th ?? null,
        body.redistribute_place ?? null,
        body.redistribute_frequency ?? null,
        body.application_kind,
        orgStatus,
        body.terms_version,
      ];

      if (row === undefined) {
        await connection.query(
          `INSERT INTO buyer_profiles (
             user_id, buyer_type, charity_approved, donor_tier, beneficiary_count, distribution_mode,
             org_name, org_type, registered, registration_number, registered_address,
             contact_name, contact_title, contact_phone, contact_email, org_lat, org_lng,
             recipient_groups_json, purpose_th, redistribute_place, redistribute_frequency,
             application_kind, org_status, draft_step, donor_terms_version, donor_terms_accepted_at,
             org_reject_reason, requested_fields_json, org_reviewed_at
           ) VALUES (
             ?, 'charity', ?, ?, ?, ?,
             ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, NULL, ?, UTC_TIMESTAMP(),
             NULL, NULL, NULL
           )`,
          [userId, ...profileFields],
        );
        if (!isIndividual && (body.documents === undefined || body.documents.length === 0)) {
          throw new HttpError(400, 'VALIDATION', 'ต้องแนบเอกสารประกอบคำขอองค์กร', {
            documents: 'ต้องมีหนังสือรับรองและรูปสถานที่',
          });
        }
      } else {
        await connection.query(
          `UPDATE buyer_profiles SET
             buyer_type = 'charity', charity_approved = ?, donor_tier = ?,
             beneficiary_count = ?, distribution_mode = ?,
             org_name = ?, org_type = ?, registered = ?, registration_number = ?, registered_address = ?,
             contact_name = ?, contact_title = ?, contact_phone = ?, contact_email = ?,
             org_lat = ?, org_lng = ?, recipient_groups_json = ?, purpose_th = ?,
             redistribute_place = ?, redistribute_frequency = ?,
             application_kind = ?, org_status = ?, draft_step = NULL,
             donor_terms_version = ?, donor_terms_accepted_at = UTC_TIMESTAMP(),
             org_reject_reason = NULL, requested_fields_json = NULL, org_reviewed_at = NULL
           WHERE user_id = ?`,
          [...profileFields, userId],
        );
        if (!isIndividual && body.documents !== undefined && body.documents.length > 0) {
          await connection.query('DELETE FROM org_application_docs WHERE user_id = ?', [userId]);
        } else if (isIndividual) {
          await connection.query('DELETE FROM org_application_docs WHERE user_id = ?', [userId]);
        }
      }

      if (!isIndividual && body.documents !== undefined && body.documents.length > 0) {
        await insertDocs(connection, userId, body.documents);
      } else if (!isIndividual) {
        const existingDocs = await countOrgDocs(connection, userId);
        if (existingDocs < 1) {
          throw new HttpError(400, 'VALIDATION', 'ต้องมีเอกสารอย่างน้อย 1 ไฟล์', {
            documents: 'ต้องมีหนังสือรับรองและรูปสถานที่',
          });
        }
      }
      await connection.query('UPDATE users SET can_buy = 1 WHERE id = ?', [userId]);
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
  '/org-applications/withdraw',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({ reason: z.string().trim().max(512).optional() })
      .parse(req.body ?? {});
    const userId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT user_id, org_status, application_kind FROM buyer_profiles WHERE user_id = ? FOR UPDATE`,
        [userId],
      );
      const row = rows[0];
      if (row === undefined || !isOpenApplicationStatus(row.org_status)) {
        throw new HttpError(409, 'CONFLICT', 'ไม่มีคำขอที่เปิดอยู่ให้ถอน');
      }
      const kindLabel =
        row.application_kind === 'individual'
          ? 'บุคคล'
          : row.application_kind === 'organization'
            ? 'องค์กร'
            : 'ไม่ระบุประเภท';
      await writeReviewLog(connection, {
        userId,
        adminId: userId,
        action: 'withdrawn',
        reason:
          body.reason ??
          `ผู้ใช้ถอนคำขอประเภท${kindLabel} (สถานะเดิม: ${String(row.org_status)})`,
      });
      await connection.query('DELETE FROM org_application_docs WHERE user_id = ?', [userId]);
      await connection.query(
        `UPDATE buyer_profiles SET
           org_status = 'none',
           application_kind = NULL,
           draft_step = NULL,
           org_name = NULL,
           org_type = NULL,
           registered = NULL,
           registration_number = NULL,
           registered_address = NULL,
           contact_title = NULL,
           contact_email = NULL,
           beneficiary_count = NULL,
           recipient_groups_json = NULL,
           purpose_th = NULL,
           redistribute_place = NULL,
           redistribute_frequency = NULL,
           org_reject_reason = NULL,
           requested_fields_json = NULL,
           org_reviewed_at = NULL,
           donor_terms_version = NULL,
           donor_terms_accepted_at = NULL,
           charity_approved = 0,
           donor_tier = NULL
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

donorsRouter.post(
  '/org-applications/switch-kind',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({ application_kind: z.enum(['individual', 'organization']) })
      .parse(req.body ?? {});
    const userId = req.auth?.id ?? 0;
    if (body.application_kind !== 'individual') {
      throw new HttpError(400, 'VALIDATION', 'ตอนนี้รองรับเฉพาะการเปลี่ยนเป็นบุคคล');
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT user_id, org_status, application_kind FROM buyer_profiles WHERE user_id = ? FOR UPDATE`,
        [userId],
      );
      const row = rows[0];
      if (row === undefined || !isOpenApplicationStatus(row.org_status)) {
        throw new HttpError(409, 'CONFLICT', 'ไม่มีคำขอที่เปิดอยู่ให้เปลี่ยนประเภท');
      }
      if (row.application_kind === 'individual') {
        await connection.commit();
        res.json({ user: await loadPublicUser(userId) });
        return;
      }
      await writeReviewLog(connection, {
        userId,
        adminId: userId,
        action: 'withdrawn',
        reason: `ถอนคำขอองค์กรเพื่อเปลี่ยนเป็นบุคคล (สถานะเดิม: ${String(row.org_status)})`,
      });
      await connection.query('DELETE FROM org_application_docs WHERE user_id = ?', [userId]);
      await connection.query(
        `UPDATE buyer_profiles SET
           application_kind = 'individual',
           org_status = 'draft',
           draft_step = 0,
           org_name = NULL,
           org_type = NULL,
           registered = NULL,
           registration_number = NULL,
           registered_address = NULL,
           contact_title = NULL,
           beneficiary_count = NULL,
           distribution_mode = 'redistribute',
           redistribute_place = NULL,
           redistribute_frequency = NULL,
           org_reject_reason = NULL,
           requested_fields_json = NULL,
           org_reviewed_at = NULL,
           charity_approved = 0,
           donor_tier = NULL
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
      if (status !== 'pending' && status !== 'needs_more_info' && status !== 'draft') {
        throw new HttpError(409, 'CONFLICT', 'อัปโหลดเอกสารเพิ่มได้เฉพาะคำขอที่รอตรวจ ขอเอกสารเพิ่ม หรือร่าง');
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
         SET org_status = 'pending', org_reject_reason = NULL, requested_fields_json = NULL, org_reviewed_at = NULL
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
    const docs = await loadDocs(userId);
    const [profileRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM buyer_profiles WHERE user_id = ?`,
      [userId],
    );
    const profile = profileRows[0];
    const logs = await loadReviewLogs(userId);
    const kind =
      profile === undefined || profile.application_kind === null || profile.application_kind === undefined
        ? null
        : String(profile.application_kind);
    const status = profile === undefined ? 'none' : String(profile.org_status);
    const showAdminMessages = status === 'needs_more_info' || status === 'rejected';
    const adminMessages = showAdminMessages
      ? logs
          .filter((log) => log.action === 'rejected' || log.action === 'needs_more_info' || log.action === 'approved')
          .map((log) => ({
            ...log,
            application_kind: kind,
          }))
      : [];
    res.json({
      user: await loadPublicUser(userId),
      documents: docs,
      documents_by_category: groupDocsByCategory(docs),
      review_logs: logs,
      admin_messages: adminMessages,
      sections: profile === undefined ? null : applicationSections(profile),
    });
  }),
);

donorsRouter.get(
  '/admin/org-applications',
  requireAuth,
  requireCapability('admin'),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.name, u.phone,
              bp.application_kind, bp.org_name, bp.org_type, bp.registered, bp.registration_number,
              bp.registered_address, bp.contact_name, bp.contact_title, bp.contact_phone, bp.contact_email,
              bp.org_lat, bp.org_lng, bp.beneficiary_count, bp.recipient_groups_json, bp.purpose_th,
              bp.distribution_mode, bp.redistribute_place, bp.redistribute_frequency,
              bp.org_status, bp.org_reject_reason, bp.requested_fields_json, bp.donor_terms_version,
              bp.donor_terms_accepted_at, bp.created_at
       FROM buyer_profiles bp
       JOIN users u ON u.id = bp.user_id
       WHERE bp.org_status IN ('pending', 'needs_more_info')
       ORDER BY bp.created_at ASC, u.id ASC`,
    );
    const apps = [];
    for (const row of rows) {
      const docs = await loadDocs(Number(row.id));
      const logs = await loadReviewLogs(Number(row.id));
      const latestChecklist = logs.find((l) => l.action === 'checklist_saved')?.checklist ?? null;
      apps.push({
        user_id: Number(row.id),
        name: String(row.name),
        phone: String(row.phone),
        application_kind: row.application_kind === null ? null : String(row.application_kind),
        org_name: row.org_name === null ? null : String(row.org_name),
        org_type: row.org_type === null ? null : String(row.org_type),
        contact_name: row.contact_name === null ? null : String(row.contact_name),
        contact_title: row.contact_title === null ? null : String(row.contact_title),
        contact_phone: row.contact_phone === null ? null : String(row.contact_phone),
        contact_email: row.contact_email === null ? null : String(row.contact_email),
        org_lat: row.org_lat === null ? null : Number(row.org_lat),
        org_lng: row.org_lng === null ? null : Number(row.org_lng),
        beneficiary_count: row.beneficiary_count === null ? null : Number(row.beneficiary_count),
        distribution_mode: row.distribution_mode === null ? null : String(row.distribution_mode),
        org_status: String(row.org_status),
        org_reject_reason: row.org_reject_reason === null ? null : String(row.org_reject_reason),
        requested_fields: parseJsonArray(row.requested_fields_json),
        donor_terms_version: row.donor_terms_version === null ? null : String(row.donor_terms_version),
        donor_terms_accepted_at:
          row.donor_terms_accepted_at === null
            ? null
            : new Date(row.donor_terms_accepted_at as string).toISOString(),
        created_at: new Date(row.created_at as string).toISOString(),
        sections: applicationSections(row),
        documents: docs,
        documents_by_category: groupDocsByCategory(docs),
        checklist: latestChecklist,
        review_logs: logs,
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
             org_reject_reason = NULL, requested_fields_json = NULL, org_reviewed_at = UTC_TIMESTAMP()
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
             org_reject_reason = ?, requested_fields_json = NULL, org_reviewed_at = UTC_TIMESTAMP()
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
    const requested = body.requested_fields ?? [];
    const requestedJson = requested.length > 0 ? JSON.stringify(requested) : null;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE buyer_profiles
         SET org_status = 'needs_more_info', charity_approved = 0, donor_tier = NULL,
             org_reject_reason = ?, requested_fields_json = ?, org_reviewed_at = UTC_TIMESTAMP()
         WHERE user_id = ? AND org_status = 'pending'`,
        [body.reason, requestedJson, userId],
      );
      if (result.affectedRows === 0) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอองค์กรที่รออนุมัติ');
      }
      await writeReviewLog(connection, {
        userId,
        adminId,
        action: 'needs_more_info',
        reason: body.reason,
        requestedFieldsJson: requestedJson,
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

donorsRouter.post(
  '/admin/org-applications/:userId/checklist',
  requireAuth,
  requireCapability('admin'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const adminId = req.auth?.id ?? 0;
    const body = checklistSchema.parse(req.body ?? {});
    const checklistJson = JSON.stringify(body.checklist);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT org_status FROM buyer_profiles WHERE user_id = ? FOR UPDATE`,
        [userId],
      );
      if (rows[0] === undefined || (rows[0].org_status !== 'pending' && rows[0].org_status !== 'needs_more_info')) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอองค์กรที่รอตรวจ');
      }
      await writeReviewLog(connection, {
        userId,
        adminId,
        action: 'checklist_saved',
        reason: null,
        checklistJson,
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.json({ ok: true, checklist: body.checklist, review_logs: await loadReviewLogs(userId) });
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
    res.setHeader('Content-Disposition', `inline; filename="${String(doc.original_name).replace(/"/g, '')}"`);
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

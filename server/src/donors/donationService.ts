import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import {
  DONOR_CONFIG,
  evaluateDonationRequest,
  proofDueAt,
  shouldPromoteToTrusted,
  shouldSuspend,
  weekStartBangkok,
  type DonationAudience,
  type DonorTier,
  type OrgStatus,
} from '../domain/donorRules';
import { HttpError } from '../http/errors';
import { pool } from '../db/pool';

export interface DonorProfile extends RowDataPacket {
  user_id: number;
  buyer_type: 'vendor' | 'shop' | 'charity' | null;
  charity_approved: number | boolean | null;
  donor_tier: DonorTier | null;
  beneficiary_count: number | null;
  distribution_mode: 'self_use' | 'redistribute' | null;
  donation_suspended: number | boolean;
  trusted_proof_count: number;
  org_status: OrgStatus;
  org_reject_reason: string | null;
  org_name: string | null;
}

export async function loadDonorProfile(connection: PoolConnection, userId: number): Promise<DonorProfile | null> {
  const [rows] = await connection.query<DonorProfile[]>(
    `SELECT user_id, buyer_type, charity_approved, donor_tier, beneficiary_count, distribution_mode,
            donation_suspended, trusted_proof_count, org_status, org_reject_reason, org_name
     FROM buyer_profiles
     WHERE user_id = ?
     FOR UPDATE`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function usedDonationKgThisWeek(connection: PoolConnection, userId: number, now = new Date()): Promise<number> {
  const start = weekStartBangkok(now);
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(h.weight_kg), 0) AS used_kg
     FROM orders o
     JOIN harvest_lots h ON h.id = o.lot_id
     WHERE o.buyer_id = ?
       AND o.is_donation = 1
       AND o.status <> 'cancelled'
       AND o.created_at >= ?`,
    [userId, start],
  );
  return Number(rows[0]?.used_kg ?? 0);
}

export function assertMayRequestDonation(input: {
  profile: DonorProfile;
  audience: DonationAudience;
  lotWeightKg: number;
  usedKg: number;
  allowDonation: boolean;
  distributionPlace: string | null | undefined;
  distributionAt: Date | null | undefined;
}): void {
  const verdict = evaluateDonationRequest({
    allowDonation: input.allowDonation,
    audience: input.audience,
    lotWeightKg: input.lotWeightKg,
    usedKg: input.usedKg,
    donor_tier: input.profile.donor_tier,
    org_status: input.profile.org_status,
    donation_suspended: input.profile.donation_suspended,
    beneficiary_count: input.profile.beneficiary_count,
  });
  if (!verdict.ok) {
    throw new HttpError(403, 'FORBIDDEN', verdict.message);
  }
  const tier = verdict.tier;
  const needsPlace =
    tier === 'volunteer' ||
    tier === 'trusted_volunteer' ||
    input.profile.distribution_mode === 'redistribute';
  if (needsPlace) {
    if (input.distributionPlace === undefined || input.distributionPlace === null || input.distributionPlace.trim() === '') {
      throw new HttpError(400, 'VALIDATION', 'กรุณาระบุสถานที่ที่จะแจก/ใช้');
    }
    if (input.distributionAt === undefined || input.distributionAt === null) {
      throw new HttpError(400, 'VALIDATION', 'กรุณาระบุวันที่จะแจก/ใช้');
    }
  }
}

export async function createDonationProofForOrder(
  connection: PoolConnection,
  orderId: number,
  deliveredAt = new Date(),
): Promise<void> {
  await connection.query(
    `INSERT INTO donation_proofs (order_id, due_at, status)
     VALUES (?, ?, 'pending')
     ON DUPLICATE KEY UPDATE order_id = order_id`,
    [orderId, proofDueAt(deliveredAt)],
  );
}

export async function recordProofResult(input: {
  userId: number;
  orderId: number;
  subjectMatch: boolean;
  storedName: string;
}): Promise<{ promoted: boolean; suspended: boolean }> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const profile = await loadDonorProfile(connection, input.userId);
    if (profile === null) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบโปรไฟล์ผู้รับบริจาค');
    }
    const status = input.subjectMatch ? 'passed' : 'failed';
    await connection.query(
      `UPDATE donation_proofs
       SET submitted_at = UTC_TIMESTAMP(), stored_name = ?, subject_match = ?, status = ?
       WHERE order_id = ? AND status = 'pending'`,
      [input.storedName, input.subjectMatch ? 1 : 0, status, input.orderId],
    );
    let promoted = false;
    let suspended = false;
    if (input.subjectMatch) {
      const nextCount = Number(profile.trusted_proof_count) + 1;
      let tier = profile.donor_tier;
      if (tier === 'volunteer' && shouldPromoteToTrusted(nextCount)) {
        tier = 'trusted_volunteer';
        promoted = true;
      }
      await connection.query(
        `UPDATE buyer_profiles SET trusted_proof_count = ?, donor_tier = ? WHERE user_id = ?`,
        [nextCount, tier, input.userId],
      );
    } else {
      await connection.query(
        `INSERT INTO donation_infractions (user_id, order_id, reason) VALUES (?, ?, 'subject_mismatch')`,
        [input.userId, input.orderId],
      );
      suspended = await maybeSuspend(connection, input.userId);
    }
    await connection.commit();
    return { promoted, suspended };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function expireMissedDonationProofs(now = new Date()): Promise<number> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT dp.id, dp.order_id, o.buyer_id
       FROM donation_proofs dp
       JOIN orders o ON o.id = dp.order_id
       WHERE dp.status = 'pending' AND dp.due_at <= ?
       FOR UPDATE`,
      [now],
    );
    for (const row of rows) {
      await connection.query(`UPDATE donation_proofs SET status = 'missed' WHERE id = ?`, [row.id]);
      await connection.query(
        `INSERT INTO donation_infractions (user_id, order_id, reason) VALUES (?, ?, 'missed_deadline')`,
        [row.buyer_id, row.order_id],
      );
      await maybeSuspend(connection, Number(row.buyer_id));
    }
    await connection.commit();
    return rows.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function maybeSuspend(connection: PoolConnection, userId: number): Promise<boolean> {
  const since = new Date(Date.now() - DONOR_CONFIG.suspendWindowDays * 24 * 60 * 60 * 1000);
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM donation_infractions WHERE user_id = ? AND created_at >= ?`,
    [userId, since],
  );
  const count = Number(rows[0]?.c ?? 0);
  if (!shouldSuspend(count)) {
    return false;
  }
  await connection.query(`UPDATE buyer_profiles SET donation_suspended = 1 WHERE user_id = ?`, [userId]);
  return true;
}

export async function unlockDonorSuspension(userId: number): Promise<void> {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE buyer_profiles SET donation_suspended = 0 WHERE user_id = ? AND donation_suspended = 1`,
    [userId],
  );
  if (result.affectedRows === 0) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผู้รับที่ถูกระงับ');
  }
}

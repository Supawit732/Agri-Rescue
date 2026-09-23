import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { assertLotTransition, type LotStatus } from '../domain/lotStateMachine';
import { expireMissedDonationProofs } from '../donors/donationService';
import { syncAllMappedCropPrices } from '../pricing/referencePrices';
import { openSellThenDonateLots } from './openDonationWindows';

export const EXPIRE_INTERVAL_MS = 10 * 60 * 1000;

interface OpenLot extends RowDataPacket {
  id: number;
  status: LotStatus;
}

export async function expireOpenLots(now = new Date()): Promise<number> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lots] = await connection.query<OpenLot[]>(
      `SELECT id, status FROM harvest_lots WHERE status = 'open' AND expires_at <= ? FOR UPDATE`,
      [now],
    );
    for (const lot of lots) {
      assertLotTransition(lot.status, 'expired');
      await connection.query('UPDATE harvest_lots SET status = ? WHERE id = ?', ['expired', lot.id]);
    }
    await connection.commit();
    return lots.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

let lastPriceSyncDay: string | null = null;

export async function maybeSyncDitPrices(now = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  if (lastPriceSyncDay === day) {
    return 0;
  }
  if (process.env.NODE_ENV === 'test') {
    return 0;
  }
  const n = await syncAllMappedCropPrices();
  lastPriceSyncDay = day;
  return n;
}

export async function runExpireJobs(
  now = new Date(),
): Promise<{ lots: number; proofs: number; donationOpened: number; pricesSynced: number }> {
  const lots = await expireOpenLots(now);
  const proofs = await expireMissedDonationProofs(now);
  const donationOpened = await openSellThenDonateLots(now);
  let pricesSynced = 0;
  try {
    pricesSynced = await maybeSyncDitPrices(now);
  } catch (error) {
    console.error('DIT price sync failed', error);
  }
  return { lots, proofs, donationOpened, pricesSynced };
}

export function startExpireSchedule(): void {
  const run = (): void => {
    void runExpireJobs().catch((error: unknown) => {
      console.error(error);
    });
  };
  run();
  setInterval(run, EXPIRE_INTERVAL_MS);
}

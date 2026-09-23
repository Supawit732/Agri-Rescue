import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { assertLotTransition, type LotStatus } from '../domain/lotStateMachine';
import { expireMissedDonationProofs } from '../donors/donationService';
import { maybeRunDitDailyJob, maybeRunHourlyPriceRetry } from './ditPipeline';
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

export async function runExpireJobs(
  now = new Date(),
  opts?: { skipDit?: boolean },
): Promise<{ lots: number; proofs: number; donationOpened: number; pricesSynced: number }> {
  const lots = await expireOpenLots(now);
  const proofs = await expireMissedDonationProofs(now);
  const donationOpened = await openSellThenDonateLots(now);
  let pricesSynced = 0;
  if (!opts?.skipDit) {
    try {
      const dit = await maybeRunDitDailyJob(now);
      pricesSynced = dit?.prices.saved ?? 0;
    } catch (error) {
      console.error('DIT daily job failed', error);
    }
    try {
      await maybeRunHourlyPriceRetry(now);
    } catch (error) {
      console.error('DIT hourly retry failed', error);
    }
  }
  return { lots, proofs, donationOpened, pricesSynced };
}

export function startExpireSchedule(): void {
  let ticks = 0;
  const run = (): void => {
    ticks += 1;
    // Skip DIT on the immediate first tick — boot warm owns startup sync.
    void runExpireJobs(new Date(), { skipDit: ticks === 1 }).catch((error: unknown) => {
      console.error(error);
    });
  };
  run();
  setInterval(run, EXPIRE_INTERVAL_MS);
}

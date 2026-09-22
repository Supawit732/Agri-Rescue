import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { assertLotTransition, type LotStatus } from '../domain/lotStateMachine';

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

export function startExpireSchedule(): void {
  const run = (): void => {
    void expireOpenLots().catch((error: unknown) => {
      console.error(error);
    });
  };
  run();
  setInterval(run, EXPIRE_INTERVAL_MS);
}

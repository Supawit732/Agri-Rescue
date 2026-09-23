import type { ResultSetHeader } from 'mysql2';
import { pool } from '../db/pool';
import { PRICING_CONFIG } from '../domain/sellerPricing';

/**
 * Open sell_then_donate lots for donation when remaining shelf < config hours.
 * Returns number of lots newly opened.
 */
export async function openSellThenDonateLots(now = new Date()): Promise<number> {
  const hours = PRICING_CONFIG.sellThenDonateHours;
  const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE harvest_lots
     SET donation_opened = 1, allow_donation = 1
     WHERE status IN ('open', 'partially_reserved')
       AND sale_mode = 'sell_then_donate'
       AND donation_opened = 0
       AND expires_at <= ?
       AND expires_at > ?`,
    [cutoff, now],
  );
  return result.affectedRows;
}

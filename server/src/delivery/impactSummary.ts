import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { round2 } from './depot';

interface ImpactRow extends RowDataPacket {
  kg_saved: number;
  co2e_kg: number;
  agreed_price_per_kg: number;
  is_donation: number;
}

export interface ImpactSummary {
  kg_saved: number;
  co2e_kg: number;
  farmer_income: number;
  donated_kg: number;
  lot_count: number;
}

export async function impactSummary(): Promise<ImpactSummary> {
  const [rows] = await pool.query<ImpactRow[]>(
    `SELECT i.kg_saved, i.co2e_kg, o.agreed_price_per_kg, o.is_donation
     FROM impact_logs i
     JOIN orders o ON o.id = i.order_id`,
  );
  let kgSaved = 0;
  let co2e = 0;
  let income = 0;
  let donated = 0;
  for (const row of rows) {
    const kg = Number(row.kg_saved);
    kgSaved += kg;
    co2e += Number(row.co2e_kg);
    if (Number(row.is_donation) === 1) {
      donated += kg;
    } else {
      income += Number(row.agreed_price_per_kg) * kg;
    }
  }
  return {
    kg_saved: round2(kgSaved),
    co2e_kg: round2(co2e),
    farmer_income: round2(income),
    donated_kg: round2(donated),
    lot_count: rows.length,
  };
}

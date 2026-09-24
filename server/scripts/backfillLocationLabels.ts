import type { RowDataPacket } from 'mysql2';
import { pool } from '../src/db/pool';
import { reverseGeocode } from '../src/geo/nominatim';

/**
 * Backfill location labels:
 * - TH fields when missing
 * - EN fields (subdistrict_en/district_en) when missing (D036)
 * Safe to re-run — only touches rows with coordinates and missing labels.
 */
async function backfillTable(table: 'plots' | 'users'): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id AS row_id, lat, lng, subdistrict_th, district_th, subdistrict_en, district_en
     FROM ${table}
     WHERE lat IS NOT NULL AND lng IS NOT NULL
       AND (
         subdistrict_th IS NULL OR district_th IS NULL
         OR subdistrict_en IS NULL OR district_en IS NULL
       )`,
  );
  let updated = 0;
  for (const row of rows) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const geo = await reverseGeocode(lat, lng);
    if (
      geo.subdistrictTh === null &&
      geo.districtTh === null &&
      geo.subdistrictEn === null &&
      geo.districtEn === null
    ) {
      continue;
    }
    await pool.query(
      `UPDATE ${table}
       SET subdistrict_th = COALESCE(subdistrict_th, ?),
           district_th = COALESCE(district_th, ?),
           subdistrict_en = COALESCE(subdistrict_en, ?),
           district_en = COALESCE(district_en, ?)
       WHERE id = ?`,
      [
        geo.subdistrictTh,
        geo.districtTh,
        geo.subdistrictEn,
        geo.districtEn,
        row.row_id,
      ],
    );
    updated += 1;
  }
  return updated;
}

async function main(): Promise<void> {
  const plots = await backfillTable('plots');
  console.log(`plots updated: ${plots}`);
  const users = await backfillTable('users');
  console.log(`users updated: ${users}`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

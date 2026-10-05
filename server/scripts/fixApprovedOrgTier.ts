import type { RowDataPacket } from 'mysql2';
import { pool } from '../src/db/pool';

/**
 * One-off: repair org applications that are approved but whose donor_tier / charity_approved
 * flags were not upgraded. Only touches rows with org_status = 'approved' AND
 * application_kind in ('organization', NULL) AND (donor_tier <> 'verified_org' OR charity_approved = 0).
 * Idempotent. `--dry-run` only prints the affected rows.
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT user_id, org_name, donor_tier, charity_approved, beneficiary_count
     FROM buyer_profiles
     WHERE org_status = 'approved'
       AND (application_kind = 'organization' OR application_kind IS NULL)
       AND (donor_tier IS NULL OR donor_tier <> 'verified_org' OR charity_approved = 0)`,
  );
  for (const r of rows) {
    console.log(
      `${dryRun ? '[dry-run] ' : ''}user ${r.user_id} "${r.org_name ?? ''}": tier=${r.donor_tier ?? 'NULL'} charity_approved=${r.charity_approved} -> verified_org/1`,
    );
  }
  if (!dryRun && rows.length > 0) {
    const [result] = await pool.query<import('mysql2').ResultSetHeader>(
      `UPDATE buyer_profiles
       SET donor_tier = 'verified_org', charity_approved = 1
       WHERE org_status = 'approved'
         AND (application_kind = 'organization' OR application_kind IS NULL)
         AND (donor_tier IS NULL OR donor_tier <> 'verified_org' OR charity_approved = 0)`,
    );
    console.log(`updated rows: ${result.affectedRows}`);
  }
  console.log(`${dryRun ? '[dry-run] ' : ''}affected: ${rows.length}`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

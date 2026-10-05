import { backfillAuditLog } from '../src/admin/auditBackfill';
import { pool } from '../src/db/pool';

/**
 * One-off: backfill admin_audit_log from org_review_logs and admin support replies.
 * Safe to re-run (already-backfilled source rows are skipped). `--dry-run` only prints counts.
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const counts = await backfillAuditLog({ dryRun });
  const verb = dryRun ? 'would insert' : 'inserted';
  console.log(`${dryRun ? '[dry-run] ' : ''}org review rows ${verb}: ${counts.orgReview}`);
  console.log(`${dryRun ? '[dry-run] ' : ''}support reply rows ${verb}: ${counts.supportReply}`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

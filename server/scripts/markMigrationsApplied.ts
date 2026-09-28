import fs from 'fs';
import path from 'path';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../src/db/pool';

/**
 * One-off setup for a DB whose tables were imported manually from
 * docs/database/schema.sql (university server) instead of via `npm run migrate`.
 * Creates schema_migrations and marks every existing migration file as already
 * applied, so a future `npm run migrate` only runs NEW migrations instead of
 * re-creating tables that already exist.
 *
 * Defaults to a dry run (prints what it would insert). Pass --apply to write.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const dir = path.join(__dirname, '../src/db/migrations');
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (apply) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(255) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  const [existingRows] = apply
    ? await pool.query<RowDataPacket[]>('SELECT id FROM schema_migrations')
    : [[] as RowDataPacket[]];
  const existing = new Set(existingRows.map((row) => String(row.id)));

  const toInsert = files.filter((file) => !existing.has(file));

  if (!apply) {
    console.log(`DRY RUN — schema_migrations table not created, nothing written.`);
    console.log(`Would mark ${toInsert.length} migration(s) as applied:`);
    for (const file of toInsert) {
      console.log(`  ${file}`);
    }
    console.log(`\nRe-run with --apply to actually write these rows.`);
    await pool.end();
    return;
  }

  for (const file of toInsert) {
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [file]);
    console.log(`marked applied: ${file}`);
  }
  console.log(`Done. ${toInsert.length} migration(s) marked applied, ${existing.size} already were.`);
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

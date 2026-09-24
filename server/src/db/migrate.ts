import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { dbConfig, pool } from './pool';

async function ensureDatabase(): Promise<void> {
  const config = dbConfig();
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }
}

export async function migrate(): Promise<void> {
  await ensureDatabase();
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(255) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Feature branch briefly numbered lot_photos as 014 before main shipped
    // 014_crop_name_en; remap so 015_lot_photos is treated as already applied.
    await connection.query(
      `UPDATE schema_migrations SET id = '015_lot_photos.sql' WHERE id = '014_lot_photos.sql'`,
    );

    const dir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const [applied] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM schema_migrations WHERE id = ?',
        [file],
      );
      if (applied.length > 0) {
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations (id) VALUES (?)', [file]);
    }
  } finally {
    connection.release();
  }
}

async function main(): Promise<void> {
  try {
    await migrate();
    console.log('migrate ok');
  } finally {
    await pool.end();
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('migrate.ts') || entry.endsWith('migrate.js')) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

export function dbConfig(): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  const database = requiredEnv('DB_NAME');
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('DB_NAME may contain only letters, digits, and underscore');
  }
  return {
    host: requiredEnv('DB_HOST'),
    port: Number(requiredEnv('DB_PORT')),
    user: requiredEnv('DB_USER'),
    password: process.env.DB_PASSWORD ?? '',
    database,
  };
}

export const pool = mysql.createPool({
  ...dbConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  multipleStatements: true,
  decimalNumbers: true,
});

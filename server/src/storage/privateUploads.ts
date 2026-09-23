import { mkdir, writeFile, readFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { DONOR_CONFIG } from '../domain/donorRules';
import { HttpError } from '../http/errors';

export const PRIVATE_UPLOADS_DIR = path.resolve(__dirname, '../../private_uploads');

const mimeToExt: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export function assertOrgDocMime(mime: string): void {
  if (!(DONOR_CONFIG.orgDocAllowedMimes as readonly string[]).includes(mime)) {
    throw new HttpError(400, 'VALIDATION', 'รองรับเฉพาะไฟล์ PDF, JPEG หรือ PNG');
  }
}

export async function savePrivateUpload(input: {
  userId: number;
  originalName: string;
  mime: string;
  base64: string;
}): Promise<{ storedName: string; sizeBytes: number }> {
  assertOrgDocMime(input.mime);
  const buffer = Buffer.from(input.base64, 'base64');
  if (buffer.length === 0) {
    throw new HttpError(400, 'VALIDATION', 'ไฟล์ว่าง');
  }
  if (buffer.length > DONOR_CONFIG.orgDocMaxBytes) {
    throw new HttpError(400, 'VALIDATION', 'ไฟล์ใหญ่เกิน 5MB');
  }
  const ext = mimeToExt[input.mime] ?? 'bin';
  const storedName = `${input.userId}/${randomUUID()}.${ext}`;
  const fullPath = path.join(PRIVATE_UPLOADS_DIR, storedName);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return { storedName, sizeBytes: buffer.length };
}

export async function readPrivateUpload(storedName: string): Promise<Buffer> {
  const resolved = path.resolve(PRIVATE_UPLOADS_DIR, storedName);
  if (!resolved.startsWith(PRIVATE_UPLOADS_DIR + path.sep) && resolved !== PRIVATE_UPLOADS_DIR) {
    throw new HttpError(400, 'VALIDATION', 'พาธไฟล์ไม่ถูกต้อง');
  }
  return readFile(resolved);
}

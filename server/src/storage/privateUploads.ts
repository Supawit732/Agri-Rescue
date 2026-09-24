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
  'image/webp': 'webp',
};

export function assertOrgDocMime(mime: string): void {
  if (!(DONOR_CONFIG.orgDocAllowedMimes as readonly string[]).includes(mime)) {
    throw new HttpError(400, 'VALIDATION', 'รองรับเฉพาะไฟล์ PDF, JPEG หรือ PNG');
  }
}

/** Support photos: jpeg/png/webp, ≤ 1MB (reuse private_uploads store). */
export function assertSupportImageMime(mime: string): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    throw new HttpError(400, 'VALIDATION', 'รองรับเฉพาะ JPEG, PNG หรือ WebP');
  }
}

export const SUPPORT_IMAGE_MAX_BYTES = 1_000_000;

export async function savePrivateUpload(input: {
  userId: number;
  originalName: string;
  mime: string;
  base64: string;
  /** When true, allow webp + 1MB support images instead of org-doc rules. */
  supportImage?: boolean;
}): Promise<{ storedName: string; sizeBytes: number }> {
  if (input.supportImage === true) {
    assertSupportImageMime(input.mime);
  } else {
    assertOrgDocMime(input.mime);
  }
  const buffer = Buffer.from(input.base64, 'base64');
  if (buffer.length === 0) {
    throw new HttpError(400, 'VALIDATION', 'ไฟล์ว่าง');
  }
  const maxBytes =
    input.supportImage === true ? SUPPORT_IMAGE_MAX_BYTES : DONOR_CONFIG.orgDocMaxBytes;
  if (buffer.length > maxBytes) {
    throw new HttpError(
      400,
      'VALIDATION',
      input.supportImage === true ? 'ไฟล์ใหญ่เกิน 1MB' : 'ไฟล์ใหญ่เกิน 5MB',
    );
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

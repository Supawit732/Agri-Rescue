import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { HttpError } from '../http/errors';

export const PUBLIC_UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

/** Max size after client resize (jpeg/webp) — 1MB. */
export const PUBLIC_PHOTO_MAX_BYTES = 1_000_000;

const mimeToExt: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/png': 'png',
};

export async function ensurePublicUploadsDir(): Promise<void> {
  await mkdir(PUBLIC_UPLOADS_DIR, { recursive: true });
}

/**
 * Save a lot photo under server/uploads/lots/.
 * Client already resizes via expo-image-manipulator (long edge ≤1024, jpeg ~0.8);
 * server enforces ≤1MB and stores jpeg/webp (png accepted then saved as .jpg bytes as-is).
 */
export async function savePublicLotPhoto(input: {
  base64: string;
  mime: string;
}): Promise<{ path: string; url: string; sizeBytes: number }> {
  const mime = input.mime.toLowerCase();
  const ext = mimeToExt[mime];
  if (ext === undefined) {
    throw new HttpError(400, 'VALIDATION', 'รองรับเฉพาะ JPEG, WebP หรือ PNG');
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.base64, 'base64');
  } catch {
    throw new HttpError(400, 'VALIDATION', 'ถอดรหัสรูปไม่สำเร็จ');
  }
  if (buffer.length === 0) {
    throw new HttpError(400, 'VALIDATION', 'ไฟล์ว่าง');
  }
  if (buffer.length > PUBLIC_PHOTO_MAX_BYTES) {
    throw new HttpError(400, 'VALIDATION', 'รูปใหญ่เกิน 1MB หลังย่อ');
  }
  const relative = `lots/${randomUUID()}.${ext}`;
  const fullPath = path.join(PUBLIC_UPLOADS_DIR, relative);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  const url = `/uploads/${relative}`;
  return { path: relative, url, sizeBytes: buffer.length };
}

/** Extract storage-relative path from a /uploads/... URL or raw relative path. */
export function lotPhotoStoragePath(photoUrl: string): string | null {
  const trimmed = photoUrl.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.startsWith('/uploads/')) {
    return trimmed.slice('/uploads/'.length);
  }
  if (trimmed.startsWith('uploads/')) {
    return trimmed.slice('uploads/'.length);
  }
  if (!trimmed.includes('://') && !trimmed.startsWith('/')) {
    return trimmed;
  }
  return null;
}

export function lotPhotoPublicUrl(storagePath: string): string {
  if (storagePath.startsWith('/uploads/')) {
    return storagePath;
  }
  return `/uploads/${storagePath.replace(/^\/+/, '')}`;
}

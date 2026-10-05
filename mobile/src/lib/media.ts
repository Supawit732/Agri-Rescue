import { API_BASE_URL } from '../api/config';

export function mediaUri(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

export async function resizeToBase64(
  uri: string,
  width: number,
  height: number,
  maxEdge: number,
): Promise<{ base64: string; mime: 'image/jpeg' }> {
  const ImageManipulator = await import('expo-image-manipulator');
  const longEdge = Math.max(width, height);
  const actions =
    longEdge > maxEdge
      ? [
          {
            resize:
              width >= height
                ? { width: maxEdge }
                : { height: maxEdge },
          },
        ]
      : [];
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.82,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (result.base64 === undefined || result.base64 === '') {
    throw new Error('empty base64');
  }
  return { base64: result.base64, mime: 'image/jpeg' };
}

export class PhotoTooLargeError extends Error {
  constructor() {
    super('photo too large');
    this.name = 'PhotoTooLargeError';
  }
}

/** Raw files above this are rejected before decoding (a phone/web original, not the upload). */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Progressively smaller attempts until the jpeg fits the limit. */
const SHRINK_STEPS: Array<{ scale: number; compress: number }> = [
  { scale: 1, compress: 0.82 },
  { scale: 0.75, compress: 0.7 },
  { scale: 0.55, compress: 0.6 },
];

/** Resize to jpeg and keep re-compressing until the decoded size is <= maxBytes. */
export async function resizeToBase64Capped(
  uri: string,
  width: number,
  height: number,
  maxEdge: number,
  maxBytes: number,
  sourceBytes?: number | null,
): Promise<{ base64: string; mime: 'image/jpeg' }> {
  if (sourceBytes != null && sourceBytes > MAX_SOURCE_BYTES) throw new PhotoTooLargeError();
  const ImageManipulator = await import('expo-image-manipulator');
  for (const step of SHRINK_STEPS) {
    const edge = Math.round(Math.min(maxEdge, Math.max(width, height)) * step.scale);
    const resize = width >= height ? { width: edge } : { height: edge };
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize }], {
      compress: step.compress,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (result.base64 === undefined || result.base64 === '') throw new Error('empty base64');
    // base64 is 4 chars per 3 bytes.
    if ((result.base64.length * 3) / 4 <= maxBytes) {
      return { base64: result.base64, mime: 'image/jpeg' };
    }
  }
  throw new PhotoTooLargeError();
}

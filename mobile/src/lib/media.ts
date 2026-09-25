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

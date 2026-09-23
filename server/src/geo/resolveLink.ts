import { HttpError } from '../http/errors';
import { isAllowedGoogleMapsHost, parseCoordsFromMapsUrl, type LatLng } from '../domain/mapsLink';

export const RESOLVE_LINK_TIMEOUT_MS = 5000;
/** Maximum redirect hops followed with redirect: 'manual'. */
export const MAX_REDIRECT_HOPS = 5;

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** Block literal IPs and loopback — SSRF guard for resolve-link. */
export function isBlockedResolveHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    return true;
  }
  if (IPV4_RE.test(host)) {
    return true;
  }
  // Any remaining colon form is treated as IPv6.
  if (host.includes(':')) {
    return true;
  }
  return false;
}

function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, 'VALIDATION', 'ลิงก์ไม่ถูกต้อง');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'FORBIDDEN_HOST', 'อนุญาตเฉพาะลิงก์ Google Maps');
  }
  if (isBlockedResolveHost(url.hostname)) {
    throw new HttpError(400, 'FORBIDDEN_HOST', 'ไม่อนุญาตให้เรียก IP หรือ localhost');
  }
  if (!isAllowedGoogleMapsHost(url.hostname)) {
    throw new HttpError(400, 'FORBIDDEN_HOST', 'อนุญาตเฉพาะลิงก์ Google Maps');
  }
  return url;
}

function assertAllowedRedirectTarget(next: URL): void {
  if (next.protocol !== 'http:' && next.protocol !== 'https:') {
    throw new HttpError(400, 'FORBIDDEN_HOST', 'อนุญาตเฉพาะลิงก์ Google Maps');
  }
  if (isBlockedResolveHost(next.hostname)) {
    throw new HttpError(400, 'FORBIDDEN_HOST', 'ไม่อนุญาตให้เรียก IP หรือ localhost');
  }
  if (!isAllowedGoogleMapsHost(next.hostname)) {
    throw new HttpError(400, 'FORBIDDEN_HOST', 'อนุญาตเฉพาะลิงก์ Google Maps');
  }
}

/**
 * Follow Google Maps short-link redirects manually (allowlisted hosts only, max 5 hops).
 */
export async function resolveGoogleMapsLink(rawUrl: string): Promise<LatLng & { finalUrl: string }> {
  const start = assertAllowedUrl(rawUrl);
  const fromStart = parseCoordsFromMapsUrl(start.href);
  if (fromStart !== null) {
    return { ...fromStart, finalUrl: start.href };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_LINK_TIMEOUT_MS);
  let current = start.href;
  let hopsUsed = 0;

  try {
    while (true) {
      let response: Response;
      try {
        response = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': 'Agri-Rescue/1.0 (educational)' },
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new HttpError(504, 'TIMEOUT', 'ตามลิงก์ไม่สำเร็จภายในเวลาที่กำหนด');
        }
        throw new HttpError(502, 'RESOLVE_FAILED', 'ตามลิงก์ Google Maps ไม่สำเร็จ');
      }

      const location = response.headers.get('location');
      if (location !== null && response.status >= 300 && response.status < 400) {
        hopsUsed += 1;
        if (hopsUsed > MAX_REDIRECT_HOPS) {
          throw new HttpError(400, 'TOO_MANY_REDIRECTS', 'ตามลิงก์เกินจำนวนที่อนุญาต');
        }
        const next = new URL(location, current);
        assertAllowedRedirectTarget(next);
        current = next.href;
        const fromRedirect = parseCoordsFromMapsUrl(current);
        if (fromRedirect !== null) {
          return { ...fromRedirect, finalUrl: current };
        }
        // Already used the max hops without a final page — stop without another fetch.
        if (hopsUsed === MAX_REDIRECT_HOPS) {
          throw new HttpError(400, 'TOO_MANY_REDIRECTS', 'ตามลิงก์เกินจำนวนที่อนุญาต');
        }
        continue;
      }

      const fromFinal = parseCoordsFromMapsUrl(response.url || current);
      if (fromFinal !== null) {
        return { ...fromFinal, finalUrl: response.url || current };
      }

      // Some short links return HTML with a meta refresh / embedded maps URL.
      if (response.ok) {
        const html = await response.text();
        const fromHtml = parseCoordsFromMapsUrl(html);
        if (fromHtml !== null) {
          return { ...fromHtml, finalUrl: current };
        }
      }

      throw new HttpError(422, 'COORDS_NOT_FOUND', 'ไม่พบพิกัดในลิงก์นี้');
    }
  } finally {
    clearTimeout(timer);
  }
}

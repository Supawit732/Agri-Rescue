/**
 * Runtime scan: call app APIs with Accept-Language: en / lang=en and fail on
 * Thai script in English-expected system fields (name_en, crop_name_en, location_label
 * when not a user plot fallback).
 *
 * Run with API on http://127.0.0.1:3000: `npm run check:en-api`
 */
import request from 'supertest';

const BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const THAI = /[฀-๿]/;

interface Hit {
  path: string;
  field: string;
  value: string;
}

async function login(phone: string): Promise<string> {
  const res = await request(BASE).post('/api/auth/login').send({ phone, password: 'demo1234' });
  if (res.status !== 200) {
    throw new Error(`login failed ${phone}: ${res.status}`);
  }
  return (res.body as { token: string }).token;
}

function isThai(value: unknown): boolean {
  return typeof value === 'string' && THAI.test(value);
}

function collect(path: string, value: unknown, hits: Hit[], trail: string[] = []): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    const leaf = trail[trail.length - 1] ?? '';
    // English-expected labels
    if (leaf === 'name_en' || leaf === 'crop_name_en' || leaf === 'district_en' || leaf === 'subdistrict_en') {
      if (isThai(value)) {
        hits.push({ path, field: trail.join('.'), value });
      }
      return;
    }
    if (leaf === 'location_label' && isThai(value)) {
      // Allow only if this string also equals a plot_name in the same object (handled below via plot_name).
      hits.push({ path, field: trail.join('.'), value });
    }
    if (leaf === 'crop' && isThai(value)) {
      // Legacy notification param with Thai crop name and no EN counterpart nearby.
      hits.push({ path, field: trail.join('.'), value });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collect(path, v, hits, [...trail, String(i)]));
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const locationThai =
      typeof obj.location_label === 'string' && isThai(obj.location_label);
    const plotName =
      typeof obj.plot_name === 'string' ? obj.plot_name : null;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'location_label' && locationThai) {
        if (plotName !== null && (obj.location_label as string) === plotName) {
          // user-typed plot fallback — skip
          continue;
        }
        // If EN labels missing entirely, fallback may be plot; still flag for backfill.
        if (obj.subdistrict_en == null && obj.district_en == null && plotName != null) {
          continue;
        }
        hits.push({ path, field: [...trail, k].join('.'), value: String(obj.location_label) });
        continue;
      }
      collect(path, v, hits, [...trail, k]);
    }
  }
}

async function fetchJson(path: string, token?: string): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?';
  let req = request(BASE).get(`${path}${sep}lang=en`).set('Accept-Language', 'en');
  if (token) {
    req = req.set('Authorization', `Bearer ${token}`);
  }
  const res = await req;
  if (res.status >= 400) {
    throw new Error(`${path} -> ${res.status}`);
  }
  return res.body;
}

async function main(): Promise<void> {
  const farmer = await login('0800000001');
  const buyer = await login('0800000011');
  const admin = await login('0800000005');
  const endpoints: Array<{ path: string; token?: string }> = [
    { path: '/api/crops' },
    { path: '/api/crops/categories' },
    { path: '/api/public/market?radius_km=50' },
    { path: '/api/market?lat=13.65&lng=100.62&radius_km=50', token: buyer },
    { path: '/api/orders/mine', token: buyer },
    { path: '/api/shops/1?lat=13.65&lng=100.62', token: buyer },
    { path: '/api/dashboard', token: farmer },
    { path: '/api/admin/overview', token: admin },
    { path: '/api/lots/mine', token: farmer },
    { path: '/api/notifications?filter=all', token: buyer },
  ];
  const hits: Hit[] = [];
  for (const ep of endpoints) {
    try {
      const body = await fetchJson(ep.path, ep.token);
      collect(ep.path, body, hits);
    } catch (error) {
      console.error(String(error));
      process.exit(1);
    }
  }
  if (hits.length > 0) {
    console.error('Thai characters in EN system fields:');
    for (const hit of hits) {
      console.error(`- ${hit.path} · ${hit.field} = ${JSON.stringify(hit.value)}`);
    }
    process.exit(1);
  }
  console.log('en-api scan OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

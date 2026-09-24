import request from 'supertest';
import { NOMINATIM_USER_AGENT, resetNominatimState } from '../../src/geo/nominatim';
import { MAX_REDIRECT_HOPS } from '../../src/geo/resolveLink';
import { GEO_RATE_LIMIT_MAX, resetGeoRateLimit } from '../../src/middleware/geoRateLimit';
import { testApp } from '../helpers';

function redirectResponse(location: string): Response {
  return {
    ok: false,
    status: 302,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'location' ? location : null),
    },
    url: '',
    text: async () => '',
  } as unknown as Response;
}

describe('GET /api/geo/reverse', () => {
  const app = testApp();

  beforeEach(async () => {
    resetNominatimState();
    await resetGeoRateLimit();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetNominatimState();
  });

  it('returns display_name from Nominatim with app User-Agent and caches 24h', async () => {
    const fetchMock = jest.fn(async () =>
      Promise.resolve({
        ok: true,
        json: async () => ({ display_name: 'บางนา, กรุงเทพมหานคร' }),
      }),
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const first = await request(app).get('/api/geo/reverse').query({ lat: 13.668, lng: 100.628 });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      lat: 13.668,
      lng: 100.628,
      display_name: 'บางนา, กรุงเทพมหานคร',
      subdistrict_th: null,
      district_th: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, { headers: Record<string, string> }][] } })
      .mock.calls[0]!;
    expect(String(url)).toContain('nominatim.openstreetmap.org/reverse');
    expect(init.headers['User-Agent']).toBe(NOMINATIM_USER_AGENT);

    const second = await request(app).get('/api/geo/reverse').query({ lat: 13.668, lng: 100.628 });
    expect(second.status).toBe(200);
    expect(second.body.display_name).toBe('บางนา, กรุงเทพมหานคร');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null display_name when Nominatim fails', async () => {
    global.fetch = jest.fn(async () => Promise.resolve({ ok: false, status: 500 })) as unknown as typeof fetch;
    const res = await request(app).get('/api/geo/reverse').query({ lat: 13.65, lng: 100.62 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      lat: 13.65,
      lng: 100.62,
      display_name: null,
      subdistrict_th: null,
      district_th: null,
    });
  });

  it('extracts subdistrict and district from addressdetails', async () => {
    resetNominatimState();
    global.fetch = jest.fn(async () =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          display_name: 'คลองเตย, กรุงเทพมหานคร',
          address: { suburb: 'คลองเตย', city_district: 'คลองเตย', city: 'กรุงเทพมหานคร' },
        }),
      }),
    ) as unknown as typeof fetch;
    const res = await request(app).get('/api/geo/reverse').query({ lat: 13.72, lng: 100.56 });
    expect(res.status).toBe(200);
    expect(res.body.subdistrict_th).toBe('คลองเตย');
    expect(res.body.district_th).toBe('คลองเตย');
  });

  it('rate-limits to at most one Nominatim request per second', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const fetchMock = jest.fn(async () =>
      Promise.resolve({
        ok: true,
        json: async () => ({ display_name: 'ที่หนึ่ง' }),
      }),
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const firstPromise = request(app).get('/api/geo/reverse').query({ lat: 13.1, lng: 100.1 });
    await jest.advanceTimersByTimeAsync(0);
    const first = await firstPromise;
    expect(first.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const secondPromise = request(app).get('/api/geo/reverse').query({ lat: 13.2, lng: 100.2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    const second = await secondPromise;
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/geo/resolve-link', () => {
  const app = testApp();

  beforeEach(async () => {
    await resetGeoRateLimit();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('parses a full Google Maps URL without network', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const res = await request(app)
      .post('/api/geo/resolve-link')
      .send({ url: 'https://www.google.com/maps/@13.7563,100.5018,17z' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lat: 13.7563, lng: 100.5018 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects non-Google domains', async () => {
    const res = await request(app)
      .post('/api/geo/resolve-link')
      .send({ url: 'https://evil.example/maps/@13.75,100.50' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FORBIDDEN_HOST');
    expect(res.body.error.message).toContain('Google Maps');
  });

  it('rejects localhost and literal IP URLs', async () => {
    const localhost = await request(app)
      .post('/api/geo/resolve-link')
      .send({ url: 'http://localhost/maps/@13.75,100.50' });
    expect(localhost.status).toBe(400);
    expect(localhost.body.error.code).toBe('FORBIDDEN_HOST');

    const ip = await request(app)
      .post('/api/geo/resolve-link')
      .send({ url: 'http://127.0.0.1/maps/@13.75,100.50' });
    expect(ip.status).toBe(400);
    expect(ip.body.error.code).toBe('FORBIDDEN_HOST');
  });

  it('follows allowlisted redirects and extracts coords', async () => {
    global.fetch = jest.fn(async () =>
      Promise.resolve(redirectResponse('https://www.google.com/maps/@13.7367,100.5232,17z')),
    ) as unknown as typeof fetch;

    const res = await request(app)
      .post('/api/geo/resolve-link')
      .send({ url: 'https://maps.app.goo.gl/abc' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lat: 13.7367, lng: 100.5232 });
  });

  it('rejects redirect to a non-Google host mid-chain', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return redirectResponse('https://www.google.com/maps?q=bangkok');
      }
      return redirectResponse('https://evil.example/steal');
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post('/api/geo/resolve-link')
      .send({ url: 'https://maps.app.goo.gl/abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FORBIDDEN_HOST');
    expect(calls).toBe(2);
  });

  it(`rejects more than ${MAX_REDIRECT_HOPS} redirect hops with 400`, async () => {
    expect(MAX_REDIRECT_HOPS).toBe(5);
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return redirectResponse(`https://www.google.com/maps?hop=${calls}`);
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post('/api/geo/resolve-link')
      .send({ url: 'https://maps.app.goo.gl/loop' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_REDIRECTS');
    expect(calls).toBe(MAX_REDIRECT_HOPS);
  });
});

describe('GET/POST /api/geo rate limit', () => {
  const app = testApp();

  beforeEach(async () => {
    await resetGeoRateLimit();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it(`returns 429 after ${GEO_RATE_LIMIT_MAX} requests per IP per minute`, async () => {
    expect(GEO_RATE_LIMIT_MAX).toBe(20);
    for (let i = 0; i < GEO_RATE_LIMIT_MAX; i += 1) {
      const res = await request(app)
        .post('/api/geo/resolve-link')
        .send({ url: 'https://www.google.com/maps/@13.7563,100.5018,17z' });
      expect(res.status).toBe(200);
    }
    const limited = await request(app)
      .post('/api/geo/resolve-link')
      .send({ url: 'https://www.google.com/maps/@13.7563,100.5018,17z' });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: {
        code: 'RATE_LIMIT',
        message: 'เรียกบริการตำแหน่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
      },
    });
  });
});

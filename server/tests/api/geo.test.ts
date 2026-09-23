import request from 'supertest';
import { NOMINATIM_USER_AGENT, resetNominatimState } from '../../src/geo/nominatim';
import { testApp } from '../helpers';

describe('GET /api/geo/reverse', () => {
  const app = testApp();

  beforeEach(() => {
    resetNominatimState();
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
    expect(res.body).toEqual({ lat: 13.65, lng: 100.62, display_name: null });
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

  it('follows allowlisted redirects and extracts coords', async () => {
    global.fetch = jest.fn(async () =>
      Promise.resolve({
        ok: false,
        status: 302,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'location'
              ? 'https://www.google.com/maps/@13.7367,100.5232,17z'
              : null,
        },
        url: 'https://maps.app.goo.gl/abc',
        text: async () => '',
      }),
    ) as unknown as typeof fetch;

    const res = await request(app)
      .post('/api/geo/resolve-link')
      .send({ url: 'https://maps.app.goo.gl/abc' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lat: 13.7367, lng: 100.5232 });
  });

  it('rejects redirect to a non-Google host', async () => {
    global.fetch = jest.fn(async () =>
      Promise.resolve({
        ok: false,
        status: 302,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'location' ? 'https://phishing.example/x' : null),
        },
        url: 'https://maps.app.goo.gl/abc',
        text: async () => '',
      }),
    ) as unknown as typeof fetch;

    const res = await request(app)
      .post('/api/geo/resolve-link')
      .send({ url: 'https://maps.app.goo.gl/abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FORBIDDEN_HOST');
  });
});

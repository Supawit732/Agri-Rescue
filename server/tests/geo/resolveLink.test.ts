import { HttpError } from '../../src/http/errors';
import {
  isBlockedResolveHost,
  MAX_REDIRECT_HOPS,
  resolveGoogleMapsLink,
  RESOLVE_LINK_TIMEOUT_MS,
} from '../../src/geo/resolveLink';

describe('resolveGoogleMapsLink', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('blocks IP and localhost hosts', () => {
    expect(isBlockedResolveHost('127.0.0.1')).toBe(true);
    expect(isBlockedResolveHost('localhost')).toBe(true);
    expect(isBlockedResolveHost('::1')).toBe(true);
    expect(isBlockedResolveHost('maps.app.goo.gl')).toBe(false);
  });

  it(`times out after ${RESOLVE_LINK_TIMEOUT_MS}ms`, async () => {
    expect(RESOLVE_LINK_TIMEOUT_MS).toBe(10000);
    jest.useFakeTimers();
    global.fetch = jest.fn((_input: unknown, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }) as unknown as typeof fetch;

    const pending = resolveGoogleMapsLink('https://maps.app.goo.gl/slow');
    const expectation = expect(pending).rejects.toMatchObject({
      status: 422,
      code: 'LINK_UNRESOLVED',
    } satisfies Partial<HttpError>);
    await jest.advanceTimersByTimeAsync(RESOLVE_LINK_TIMEOUT_MS);
    await expectation;
  });

  it(`stops after ${MAX_REDIRECT_HOPS} hops`, async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return {
        ok: false,
        status: 302,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'location' ? `https://goo.gl/maps/hop${calls}` : null,
        },
        url: '',
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await expect(resolveGoogleMapsLink('https://maps.app.goo.gl/loop')).rejects.toMatchObject({
      status: 400,
      code: 'TOO_MANY_REDIRECTS',
    });
    expect(calls).toBe(MAX_REDIRECT_HOPS);
  });

  it('follows a consent.google.com redirect via its continue param', async () => {
    const target = 'https://www.google.com/maps/@13.75,100.5,15z';
    global.fetch = jest.fn(async () => {
      return {
        ok: false,
        status: 302,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'location'
              ? `https://consent.google.com/m?continue=${encodeURIComponent(target)}&gl=TH`
              : null,
        },
        url: '',
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await expect(resolveGoogleMapsLink('https://maps.app.goo.gl/consent')).resolves.toMatchObject({
      lat: 13.75,
      lng: 100.5,
    });
  });

  it('parses coordinates from JSON-LD in HTML body', async () => {
    const htmlWithJsonLd = `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Place",
              "geo": {
                "latitude": 13.736717,
                "longitude": 100.523186
              }
            }
          </script>
        </head>
        <body>Map Content</body>
      </html>
    `;
    global.fetch = jest.fn(async () => {
      return {
        ok: true,
        status: 200,
        headers: {
          get: () => null,
        },
        url: 'https://www.google.com/maps/place/some-place',
        text: async () => htmlWithJsonLd,
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await expect(resolveGoogleMapsLink('https://maps.app.goo.gl/jsonld')).resolves.toMatchObject({
      lat: 13.736717,
      lng: 100.523186,
    });
  });

  it('parses coordinates from center parameter in query string', async () => {
    const urlWithCenter = 'https://www.google.com/maps/place/Test?center=14.5,101.0';
    global.fetch = jest.fn(async () => {
      return {
        ok: true,
        status: 200,
        headers: {
          get: () => null,
        },
        url: urlWithCenter,
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await expect(resolveGoogleMapsLink('https://maps.app.goo.gl/center')).resolves.toMatchObject({
      lat: 14.5,
      lng: 101.0,
    });
  });

  it('handles a real short-link redirect chain with geolocation redirect', async () => {
    let callCount = 0;
    global.fetch = jest.fn(async (url: string | Request) => {
      const urlStr = typeof url === 'string' ? url : url.url;
      callCount++;

      // First hop: maps.app.goo.gl redirects to consent
      if (urlStr.includes('maps.app.goo.gl')) {
        return {
          ok: false,
          status: 307,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === 'location'
                ? 'https://consent.google.com/m?continue=' +
                  encodeURIComponent('https://www.google.com/maps/@13.7563,100.5018,15z')
                : null,
          },
          url: '',
          text: async () => '',
        } as unknown as Response;
      }

      // Final page with JSON-LD coordinates (consent.google.com continue URL points here)
      return {
        ok: true,
        status: 200,
        headers: {
          get: () => null,
        },
        url: 'https://www.google.com/maps/@13.7563,100.5018,15z',
        text: async () =>
          '{"geo":{"latitude":13.7563,"longitude":100.5018}}',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await resolveGoogleMapsLink('https://maps.app.goo.gl/R9hbhk6B7eDxvtX18');
    expect(result).toMatchObject({
      lat: 13.7563,
      lng: 100.5018,
    });
    // Should make at least 1 fetch call (some hops are handled by URL parsing without fetch)
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});

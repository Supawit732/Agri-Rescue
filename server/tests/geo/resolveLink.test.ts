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
    expect(RESOLVE_LINK_TIMEOUT_MS).toBe(5000);
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
      status: 504,
      code: 'TIMEOUT',
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
});

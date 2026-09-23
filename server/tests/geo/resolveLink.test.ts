import { HttpError } from '../../src/http/errors';
import { resolveGoogleMapsLink, RESOLVE_LINK_TIMEOUT_MS } from '../../src/geo/resolveLink';

describe('resolveGoogleMapsLink', () => {
  afterEach(() => {
    jest.useRealTimers();
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
});

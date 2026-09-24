import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { useI18n } from '../i18n';

interface ApiDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useApiData<T>(loader: () => Promise<T>, deps: readonly unknown[]): ApiDataState<T> {
  const { translateError } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await loader();
        if (active) {
          setData(result);
        }
      } catch (err) {
        if (active) {
          if (err instanceof ApiError) {
            setError(translateError(err.code, err.message));
          } else {
            setError(translateError('ERROR'));
          }
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, translateError]);

  return { data, loading, error, reload };
}

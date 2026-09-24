export type ResponseLocale = 'th' | 'en';

/** Parse client locale from `?lang=` or `Accept-Language` (default Thai). */
export function requestLocale(header: unknown, query: unknown): ResponseLocale {
  const q = typeof query === 'string' ? query.toLowerCase() : '';
  if (q === 'en' || q === 'en-us' || q === 'en-gb') {
    return 'en';
  }
  if (q === 'th' || q === 'th-th') {
    return 'th';
  }
  const raw = typeof header === 'string' ? header.toLowerCase() : '';
  if (raw.includes('en')) {
    return 'en';
  }
  if (raw.includes('th')) {
    return 'th';
  }
  return 'th';
}

export function pickLocalized(
  locale: ResponseLocale,
  th: string | null | undefined,
  en: string | null | undefined,
): string | null {
  const thStr = th == null ? '' : String(th).trim();
  const enStr = en == null ? '' : String(en).trim();
  if (locale === 'en') {
    if (enStr !== '') {
      return enStr;
    }
    return thStr === '' ? null : thStr;
  }
  if (thStr !== '') {
    return thStr;
  }
  return enStr === '' ? null : enStr;
}

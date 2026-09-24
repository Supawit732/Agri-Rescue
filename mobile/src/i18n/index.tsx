import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadLocale, saveLocale } from '../api/storage';
import en from './en';
import { resolveMessageCode } from './serverMessageCodes';
import th from './th';
import type { CropNameSource, Locale, Messages } from './types';
import { locales } from './types';

const catalogs: Record<Locale, Messages> = { th, en };

const intlLocale: Record<Locale, string> = {
  th: 'th-TH',
  en: 'en-GB',
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
  formatNumber: (n: number) => string;
  formatDateTime: (isoOrDate: string | Date) => string;
  formatDate: (isoOrDate: string | Date) => string;
  formatRelativeTime: (isoOrDate: string | Date) => string;
  cropName: (crop: CropNameSource) => string;
  translateError: (code: string, fallback?: string) => string;
  translateFieldError: (codeOrMessage: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function toDate(isoOrDate: string | Date): Date {
  return isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
}

export function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.replaceAll(`{${key}}`, String(val)),
    template,
  );
}

export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(n);
}

export function formatDateTime(isoOrDate: string | Date, locale: Locale): string {
  const date = toDate(isoOrDate);
  if (Number.isNaN(date.getTime())) {
    return String(isoOrDate);
  }
  return new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatDate(isoOrDate: string | Date, locale: Locale): string {
  const date = toDate(isoOrDate);
  if (Number.isNaN(date.getTime())) {
    return String(isoOrDate);
  }
  return new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: 'medium' }).format(date);
}

/** Relative time like “5 นาทีที่แล้ว” / “5 min ago”. */
export function formatRelativeTime(
  isoOrDate: string | Date,
  t: Messages,
  now: Date = new Date(),
): string {
  const date = toDate(isoOrDate);
  if (Number.isNaN(date.getTime())) {
    return String(isoOrDate);
  }
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return t.notifications.justNow;
  }
  if (minutes < 60) {
    return formatTemplate(t.notifications.minutesAgo, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return formatTemplate(t.notifications.hoursAgo, { n: hours });
  }
  const days = Math.floor(hours / 24);
  return formatTemplate(t.notifications.daysAgo, { n: days });
}

export function cropName(crop: CropNameSource, locale: Locale): string {
  if (locale === 'en' && crop.name_en != null && crop.name_en.trim() !== '') {
    return crop.name_en;
  }
  return crop.name_th;
}

export function translateError(code: string, fallback?: string, locale: Locale = 'th'): string {
  const resolved = resolveMessageCode(code);
  const mapped = catalogs[locale].errors[resolved] ?? catalogs[locale].errors[code];
  if (mapped !== undefined) {
    return mapped;
  }
  if (fallback !== undefined) {
    const fromFallback = catalogs[locale].errors[resolveMessageCode(fallback)];
    if (fromFallback !== undefined) {
      return fromFallback;
    }
    return fallback;
  }
  return catalogs[locale].errors.ERROR ?? code;
}

export function translateFieldError(codeOrMessage: string, locale: Locale = 'th'): string {
  const resolved = resolveMessageCode(codeOrMessage);
  const mapped =
    catalogs[locale].fieldErrors[resolved] ?? catalogs[locale].fieldErrors[codeOrMessage];
  if (mapped !== undefined) {
    return mapped;
  }
  const asError = catalogs[locale].errors[resolved];
  if (asError !== undefined) {
    return asError;
  }
  return codeOrMessage;
}

function buildHelpers(locale: Locale, t: Messages): Omit<I18nContextValue, 'locale' | 'setLocale' | 't'> {
  return {
    formatNumber: (n) => formatNumber(n, locale),
    formatDateTime: (isoOrDate) => formatDateTime(isoOrDate, locale),
    formatDate: (isoOrDate) => formatDate(isoOrDate, locale),
    formatRelativeTime: (isoOrDate) => formatRelativeTime(isoOrDate, t),
    cropName: (crop) => cropName(crop, locale),
    translateError: (code, fallback) => translateError(code, fallback, locale),
    translateFieldError: (codeOrMessage) => translateFieldError(codeOrMessage, locale),
  };
}

export function I18nProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [locale, setLocaleState] = useState<Locale>('th');

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadLocale();
      if (active && (stored === 'th' || stored === 'en')) {
        setLocaleState(stored);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void saveLocale(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const t = catalogs[locale];
    return {
      locale,
      setLocale,
      t,
      ...buildHelpers(locale, t),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (value === null) {
    const t = th;
    return { locale: 'th', setLocale: () => undefined, t, ...buildHelpers('th', t) };
  }
  return value;
}

export type { CropNameSource, Locale, Messages };
export { locales };
export { en, th };

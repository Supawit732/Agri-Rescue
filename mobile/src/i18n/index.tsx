import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadLocale, saveLocale } from '../api/storage';
import en from './en';
import th from './th';
import type { Locale, Messages } from './types';

const catalogs: Record<Locale, Messages> = { th, en };

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
};

const I18nContext = createContext<I18nContextValue | null>(null);

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

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: catalogs[locale],
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (value === null) {
    return { locale: 'th', setLocale: () => undefined, t: th };
  }
  return value;
}

export function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.replaceAll(`{${key}}`, String(val)),
    template,
  );
}

export type { Locale, Messages };

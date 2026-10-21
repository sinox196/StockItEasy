'use client';

import {
  AppLocale,
  createTranslator,
  direction,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  isSupportedLocale,
  translateError,
  TranslateParams,
} from '@stockiteasy/i18n';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setApiLocaleGetter } from '@/lib/api';

export const LOCALE_COOKIE = 'sie_locale';

interface I18nValue {
  locale: AppLocale;
  dir: 'ltr' | 'rtl';
  t: (key: string, params?: TranslateParams) => string;
  te: (code: string | undefined) => string;
  setLocale: (l: AppLocale) => void;
  money: (v: string | number | null | undefined, currency?: string) => string;
  num: (v: string | number | null | undefined, digits?: number) => string;
  pct: (v: string | number | null | undefined) => string;
  date: (v: string | Date | null | undefined) => string;
  dateTime: (v: string | Date | null | undefined) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: AppLocale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    setApiLocaleGetter(() => locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
  }, [locale]);

  const setLocale = useCallback((l: AppLocale) => {
    if (!isSupportedLocale(l)) return;
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    setLocaleState(l);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = createTranslator(locale);
    return {
      locale,
      dir: direction(locale),
      t,
      te: (code) => translateError(locale, code),
      setLocale,
      money: (v, currency = 'TND') => formatMoney(v, locale, currency),
      num: (v, digits = 3) => formatNumber(v, locale, { maximumFractionDigits: digits }),
      pct: (v) => formatPercent(v, locale),
      date: (v) => formatDate(v, locale),
      dateTime: (v) => formatDateTime(v, locale),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}

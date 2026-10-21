import frTN from '../locales/fr-TN.json';
import en from '../locales/en.json';
import arTN from '../locales/ar-TN.json';

/**
 * Lightweight i18n runtime shared by the API (emails, notifications), the web
 * app (SSR + client) and the mobile app. French (fr-TN) is the default and the
 * fallback for any missing key.
 */

export const SUPPORTED_LOCALES = ['fr-TN', 'en', 'ar-TN'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const FALLBACK_LOCALE: AppLocale = 'fr-TN';

export type Messages = typeof frTN;
type Tree = { [k: string]: string | Tree };

export const messages: Record<AppLocale, Tree> = {
  'fr-TN': frTN as Tree,
  en: en as Tree,
  'ar-TN': arTN as Tree,
};

export const LOCALE_LABELS: Record<AppLocale, string> = {
  'fr-TN': 'Français',
  en: 'English',
  'ar-TN': 'الدارجة التونسية',
};

export function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Maps an Accept-Language style value ("ar", "en-US", "fr") to a supported locale. */
export function resolveLocale(value: string | null | undefined): AppLocale {
  if (!value) return FALLBACK_LOCALE;
  if (isSupportedLocale(value)) return value;
  const candidates = value.split(',').map((part) => part.split(';')[0].trim().toLowerCase());
  for (const c of candidates) {
    if (c.startsWith('ar')) return 'ar-TN';
    if (c.startsWith('en')) return 'en';
    if (c.startsWith('fr')) return 'fr-TN';
  }
  return FALLBACK_LOCALE;
}

export function isRtl(locale: AppLocale): boolean {
  return locale === 'ar-TN';
}

export function direction(locale: AppLocale): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

function lookup(tree: Tree, key: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export type TranslateParams = Record<string, string | number | null | undefined>;

export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    return v === undefined || v === null ? match : String(v);
  });
}

export function translate(locale: AppLocale, key: string, params?: TranslateParams): string {
  const template = lookup(messages[locale], key) ?? lookup(messages[FALLBACK_LOCALE], key);
  if (template === undefined) return key;
  return interpolate(template, params);
}

export function hasKey(locale: AppLocale, key: string): boolean {
  return lookup(messages[locale], key) !== undefined;
}

export type Translator = ((key: string, params?: TranslateParams) => string) & { locale: AppLocale };

export function createTranslator(locale: AppLocale): Translator {
  const t = ((key: string, params?: TranslateParams) => translate(locale, key, params)) as Translator;
  t.locale = locale;
  return t;
}

/** Flattens a message tree into dotted keys (used by tests and tooling). */
export function flattenKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : flattenKeys(v, `${prefix}${k}.`),
  );
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export const DEFAULT_TIME_ZONE = 'Africa/Tunis';

/** Intl locale tags. Latin digits are forced so amounts, SKUs and phone numbers read the same everywhere. */
const INTL_LOCALE: Record<AppLocale, string> = {
  'fr-TN': 'fr-TN',
  en: 'en-GB',
  'ar-TN': 'ar-TN-u-nu-latn',
};

export function intlLocale(locale: AppLocale): string {
  return INTL_LOCALE[locale];
}

export function currencyDigits(currency: string): number {
  return ['TND', 'KWD', 'BHD', 'OMR', 'LYD', 'JOD', 'IQD'].includes(currency) ? 3 : 2;
}

export function formatMoney(value: string | number | null | undefined, locale: AppLocale, currency = 'TND'): string {
  const n = Number(value ?? 0);
  const digits = currencyDigits(currency);
  if (currency === 'TND') {
    const num = new Intl.NumberFormat(INTL_LOCALE[locale], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
    return locale === 'ar-TN' ? `${num} د.ت` : `${num} DT`;
  }
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatNumber(
  value: string | number | null | undefined,
  locale: AppLocale,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 3 },
): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(Number(value ?? 0));
}

export function formatPercent(value: string | number | null | undefined, locale: AppLocale, digits = 1): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'percent',
    maximumFractionDigits: digits,
  }).format(Number(value ?? 0) / 100);
}

export function formatDate(
  value: string | number | Date | null | undefined,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
  timeZone = DEFAULT_TIME_ZONE,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone, ...options }).format(date);
}

export function formatDateTime(value: string | number | Date | null | undefined, locale: AppLocale, timeZone = DEFAULT_TIME_ZONE): string {
  return formatDate(value, locale, { dateStyle: 'medium', timeStyle: 'short' }, timeZone);
}

/** Translates an API error code ("INSUFFICIENT_STOCK") into a user message. */
export function translateError(locale: AppLocale, code: string | undefined): string {
  const key = `errors.${code ?? 'UNKNOWN'}`;
  return hasKey(locale, key) || hasKey(FALLBACK_LOCALE, key) ? translate(locale, key) : translate(locale, 'errors.UNKNOWN');
}

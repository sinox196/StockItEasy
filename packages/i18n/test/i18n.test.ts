import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  direction,
  flattenKeys,
  formatDate,
  formatMoney,
  messages,
  resolveLocale,
  translate,
  translateError,
  SUPPORTED_LOCALES,
} from '../src';

const frKeys = flattenKeys(messages['fr-TN']).sort();

describe('catalogue completeness', () => {
  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale} has exactly the French keys`, () => {
      const keys = flattenKeys(messages[locale]).sort();
      expect(keys.filter((k) => !frKeys.includes(k))).toEqual([]);
      expect(frKeys.filter((k) => !keys.includes(k))).toEqual([]);
    });
    it(`${locale} keeps the same placeholders as French`, () => {
      const t = createTranslator(locale);
      const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
      for (const key of frKeys) {
        expect(placeholders(t(key)), key).toBe(placeholders(translate('fr-TN', key)));
      }
    });
  }
});

describe('runtime', () => {
  it('defaults and falls back to French', () => {
    expect(resolveLocale(undefined)).toBe('fr-TN');
    expect(resolveLocale('de-DE')).toBe('fr-TN');
    expect(resolveLocale('ar-SA,ar;q=0.9')).toBe('ar-TN');
    expect(resolveLocale('en-US')).toBe('en');
    expect(translate('en', 'missing.key')).toBe('missing.key');
  });
  it('uses the expected product vocabulary', () => {
    expect(translate('fr-TN', 'nav.dashboard')).toBe('Tableau de bord');
    expect(translate('en', 'dashboard.lowStock')).toBe('Low Stock');
    expect(translate('ar-TN', 'nav.inventory')).toBe('تسيير الستوك');
    expect(translate('ar-TN', 'dashboard.addProduct')).toBe('زيد منتوج');
    expect(translate('ar-TN', 'dashboard.orderNow')).toBe('اطلب توّا');
  });
  it('interpolates parameters', () => {
    expect(translate('fr-TN', 'pos.saleDone', { number: 'V-0001' })).toContain('V-0001');
  });
  it('sets RTL only for Arabic', () => {
    expect(direction('ar-TN')).toBe('rtl');
    expect(direction('fr-TN')).toBe('ltr');
  });
  it('formats TND with millimes and latin digits in Arabic', () => {
    expect(formatMoney('1234.5', 'en')).toBe('1,234.500 DT');
    expect(formatMoney('24.9', 'ar-TN')).toMatch(/^24[.,٫]900 د\.ت$/);
    expect(formatMoney('24.9', 'fr-TN')).toMatch(/^24,900\sDT$/);
  });
  it('formats dates in Africa/Tunis', () => {
    expect(formatDate('2026-03-01T23:30:00Z', 'en', { dateStyle: 'short' })).toBe('02/03/2026');
  });
  it('translates API error codes with a safe default', () => {
    expect(translateError('en', 'INSUFFICIENT_STOCK')).toBe('Insufficient available stock.');
    expect(translateError('en', 'SOMETHING_ELSE')).toBe('An unexpected error occurred.');
  });
});

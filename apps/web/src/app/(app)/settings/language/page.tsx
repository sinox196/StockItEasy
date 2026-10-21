'use client';

import { AppLocale, formatDateTime, formatMoney, formatNumber, LOCALE_LABELS, SUPPORTED_LOCALES } from '@stockiteasy/i18n';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/misc';
import { Num } from '@/components/ui/states';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n';

export default function LanguagePage() {
  const { t, locale, setLocale } = useI18n();
  const choose = async (l: AppLocale) => {
    setLocale(l);
    try {
      await api.me.update({ locale: l });
      toast.success(t('common.saved'));
    } catch {
      /* the cookie keeps the choice even if the profile update fails */
    }
  };
  const now = new Date();
  return (
    <div>
      <PageHeader title={t('settings.languageTitle')} description={t('settings.languageHint')} />
      <div className="grid gap-3 sm:grid-cols-3">
        {SUPPORTED_LOCALES.map((l) => (
          <button key={l} onClick={() => choose(l)} className={cn('card flex items-center justify-between p-5 text-start transition', l === locale ? 'ring-2 ring-secondary' : 'hover:shadow-md')} aria-pressed={l === locale}>
            <span>
              <span className="block text-lg font-semibold" lang={l}>{LOCALE_LABELS[l]}</span>
              <span className="text-xs text-muted-foreground" dir="ltr">{l}</span>
            </span>
            {l === locale && <Check className="size-5 text-secondary" />}
          </button>
        ))}
      </div>
      <Card className="mt-5">
        <CardHeader title={t('settings.formatPreview')} />
        <CardBody className="grid gap-3 text-sm sm:grid-cols-3">
          {SUPPORTED_LOCALES.map((l) => (
            <div key={l} className="rounded-lg border border-border p-3" dir={l === 'ar-TN' ? 'rtl' : 'ltr'} lang={l}>
              <p className="font-semibold">{LOCALE_LABELS[l]}</p>
              <p><Num>{formatMoney('1234.5', l)}</Num></p>
              <p><Num>{formatNumber('98765.432', l)}</Num></p>
              <p>{formatDateTime(now, l)}</p>
              <p>SKU <Num>OLV-001</Num> · <Num>+216 71 000 000</Num></p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

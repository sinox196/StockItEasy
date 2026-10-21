'use client';

import type { Organization } from '@stockiteasy/api-client';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@stockiteasy/i18n';
import { PAYMENT_METHODS, SECTORS, VALUATION_METHODS } from '@stockiteasy/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Guard } from '@/components/shell/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { Num, QueryState } from '@/components/ui/states';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function SettingsForm({ org }: { org: Organization }) {
  const { t } = useI18n();
  const { can, reload } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const editable = can('settings.update');
  const [f, setF] = useState({
    name: org.name,
    sector: org.sector,
    currency: org.currency,
    timezone: org.timezone,
    defaultLocale: org.defaultLocale,
    valuationMethod: org.valuationMethod,
    allowNegativeStock: org.allowNegativeStock,
    purchaseBudget: org.purchaseBudget ?? '',
    serviceLevel: String(Number(org.serviceLevel)),
    reviewPeriodDays: String(org.reviewPeriodDays),
    enabledPaymentMethods: org.enabledPaymentMethods,
    taxId: org.taxId ?? '',
    address: org.address ?? '',
    phone: org.phone ?? '',
  });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.organizations.update({
        ...f,
        purchaseBudget: f.purchaseBudget === '' ? null : f.purchaseBudget,
        serviceLevel: Number(f.serviceLevel),
        reviewPeriodDays: Number(f.reviewPeriodDays),
        taxId: f.taxId || null,
        address: f.address || null,
        phone: f.phone || null,
      });
      await qc.invalidateQueries({ queryKey: ['organization'] });
      await reload();
      toast.success(t('common.saved'));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-2">
      <fieldset disabled={!editable} className="contents">
        <Card>
          <CardHeader title={t('settings.general')} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t('onboarding.companyName')} htmlFor="on" className="sm:col-span-2"><Input id="on" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label={t('onboarding.sector')} htmlFor="os"><Select id="os" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value as typeof f.sector })}>{SECTORS.map((s) => <option key={s} value={s}>{t(`sectors.${s}`)}</option>)}</Select></Field>
            <Field label={t('onboarding.currency')} htmlFor="oc"><Input id="oc" dir="ltr" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label={t('settings.timezone')} htmlFor="otz"><Input id="otz" dir="ltr" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></Field>
            <Field label={t('settings.defaultLanguage')} htmlFor="ol"><Select id="ol" value={f.defaultLocale} onChange={(e) => setF({ ...f, defaultLocale: e.target.value })}>{SUPPORTED_LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}</Select></Field>
            <Field label={t('settings.taxId')} htmlFor="ot"><Input id="ot" dir="ltr" value={f.taxId} onChange={(e) => setF({ ...f, taxId: e.target.value })} /></Field>
            <Field label={t('settings.phone')} htmlFor="op"><Input id="op" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label={t('settings.address')} htmlFor="oa" className="sm:col-span-2"><Input id="oa" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('settings.stockRules')} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.valuationMethod')} htmlFor="ov" className="sm:col-span-2"><Select id="ov" value={f.valuationMethod} onChange={(e) => setF({ ...f, valuationMethod: e.target.value as typeof f.valuationMethod })}>{VALUATION_METHODS.map((v) => <option key={v} value={v}>{t(`settings.valuation${v}`)}</option>)}</Select></Field>
            <Checkbox className="sm:col-span-2" label={t('settings.allowNegativeStock')} checked={f.allowNegativeStock} onChange={(e) => setF({ ...f, allowNegativeStock: e.target.checked })} />
            <Field label={t('settings.purchaseBudget')} htmlFor="ob"><Input id="ob" dir="ltr" inputMode="decimal" value={f.purchaseBudget} onChange={(e) => setF({ ...f, purchaseBudget: e.target.value })} /></Field>
            <Field label={t('settings.serviceLevel')} htmlFor="osl"><Select id="osl" value={f.serviceLevel} onChange={(e) => setF({ ...f, serviceLevel: e.target.value })}>{['0.9', '0.95', '0.975', '0.99'].map((v) => <option key={v} value={v}>{Number(v) * 100} %</option>)}</Select></Field>
            <Field label={t('settings.reviewPeriod')} htmlFor="orp"><Input id="orp" type="number" min={1} max={90} dir="ltr" value={f.reviewPeriodDays} onChange={(e) => setF({ ...f, reviewPeriodDays: e.target.value })} /></Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">{t('settings.paymentMethods')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <Checkbox key={m} label={t(`settings.paymentMethodsList.${m}`)} checked={f.enabledPaymentMethods.includes(m)} onChange={(e) => setF({ ...f, enabledPaymentMethods: e.target.checked ? [...f.enabledPaymentMethods, m] : f.enabledPaymentMethods.filter((x) => x !== m) })} />
                ))}
              </div>
            </fieldset>
          </CardBody>
        </Card>
      </fieldset>
      {editable && <div className="xl:col-span-2"><Button type="submit" loading={busy}>{t('common.save')}</Button></div>}
    </form>
  );
}

function Subscription() {
  const { t } = useI18n();
  const usage = useQuery({ queryKey: ['usage'], queryFn: api.organizations.usage });
  return (
    <Card className="mt-5">
      <CardHeader title={t('settings.subscription')} />
      <QueryState query={usage}>
        {(u) => (
          <CardBody>
            <p className="text-sm">{t('settings.currentPlan')}: <strong>{u.subscription ? t(`plans.${u.subscription.plan}`) : '—'}</strong> <span className="text-muted-foreground">({u.subscription?.status})</span></p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {([['quotaUsers', u.usage.users, u.subscription?.maxUsers], ['quotaWarehouses', u.usage.warehouses, u.subscription?.maxWarehouses], ['quotaProducts', u.usage.products, u.subscription?.maxProducts]] as const).map(([k, used, max]) => (
                <div key={k} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{t(`settings.${k}`)}</p>
                  <p className="mt-1 font-semibold"><Num>{used} / {max ?? '∞'}</Num></p>
                  {max ? <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-secondary" style={{ width: `${Math.min(100, (used / max) * 100)}%` }} /></div> : <p className="text-xs text-muted-foreground">{t('settings.unlimited')}</p>}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t('settings.billingNotConfigured')}</p>
          </CardBody>
        )}
      </QueryState>
    </Card>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ['organization'], queryFn: api.organizations.current });
  const [key, setKey] = useState(0);
  useEffect(() => setKey((k) => k + 1), [query.data]);
  return (
    <Guard permission="settings.read">
      <PageHeader title={t('settings.title')} />
      <QueryState query={query}>{(org) => <SettingsForm key={key} org={org} />}</QueryState>
      <Subscription />
    </Guard>
  );
}

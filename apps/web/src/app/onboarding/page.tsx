'use client';

import { SECTORS, type Sector } from '@stockiteasy/shared';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { LanguageSwitcher } from '@/components/shell/auth-layout';
import { RequireAuth } from '@/components/shell/require-auth';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { session } from '@/lib/session';
import { useErrorToast } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

/** Workflow A: account → company → sector → first warehouse → operational dashboard. */
function Onboarding() {
  const { t } = useI18n();
  const router = useRouter();
  const { reload, selectOrg } = useAuth();
  const onError = useErrorToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', city: '', currency: 'TND', sector: 'GROCERY' as Sector, firstWarehouseName: '', firstStoreName: '', withDemoData: false });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const steps = [t('onboarding.stepCompany'), t('onboarding.stepSector'), t('onboarding.stepWarehouse')];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (step < 2) return setStep(step + 1);
    setBusy(true);
    try {
      const org = await api.organizations.create({
        name: form.name,
        city: form.city || undefined,
        currency: form.currency,
        sector: form.sector,
        firstWarehouseName: form.firstWarehouseName,
        firstStoreName: form.firstStoreName || undefined,
        withDemoData: form.withDemoData,
      });
      session.setOrg(org.id);
      await reload();
      selectOrg(org.id);
      router.replace('/dashboard');
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex justify-end p-4"><LanguageSwitcher /></div>
      <div className="mx-auto max-w-2xl px-4 pb-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('onboarding.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('onboarding.subtitle')}</p>
        <ol className="mt-8 flex gap-2">
          {steps.map((s, i) => (
            <li key={s} className={cn('flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm', i === step ? 'border-secondary bg-info-soft font-semibold' : i < step ? 'border-success/40 text-success' : 'border-border text-muted-foreground')}>
              <span className={cn('flex size-6 items-center justify-center rounded-full text-xs', i < step ? 'bg-success text-white' : 'bg-muted')}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>
              <span className="truncate">{s}</span>
            </li>
          ))}
        </ol>
        <form onSubmit={submit} className="card mt-6 space-y-5 p-6">
          {step === 0 && (
            <>
              <Field label={t('onboarding.companyName')} htmlFor="name" required>
                <Input id="name" required minLength={2} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('onboarding.city')} htmlFor="city"><Input id="city" value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
                <Field label={t('onboarding.currency')} htmlFor="currency"><Input id="currency" dir="ltr" maxLength={3} value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} /></Field>
              </div>
            </>
          )}
          {step === 1 && (
            <fieldset>
              <legend className="mb-3 text-sm font-medium">{t('onboarding.sector')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {SECTORS.map((s) => (
                  <button type="button" key={s} onClick={() => set('sector', s)} className={cn('rounded-lg border px-4 py-3 text-start text-sm transition-colors', form.sector === s ? 'border-secondary bg-info-soft font-semibold' : 'border-border hover:bg-muted')} aria-pressed={form.sector === s}>
                    {t(`sectors.${s}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {step === 2 && (
            <>
              <Field label={t('onboarding.warehouseName')} htmlFor="wh" required>
                <Input id="wh" required minLength={2} value={form.firstWarehouseName} onChange={(e) => set('firstWarehouseName', e.target.value)} autoFocus />
              </Field>
              <Field label={t('onboarding.storeName')} htmlFor="store"><Input id="store" value={form.firstStoreName} onChange={(e) => set('firstStoreName', e.target.value)} /></Field>
              <div className="rounded-lg border border-dashed border-border p-4">
                <Checkbox label={t('onboarding.demoData')} checked={form.withDemoData} onChange={(e) => set('withDemoData', e.target.checked)} />
                <p className="ms-6 mt-1 text-xs text-muted-foreground">{t('onboarding.demoDataHint')}</p>
              </div>
            </>
          )}
          <div className="flex justify-between gap-2 pt-2">
            <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>{t('common.back')}</Button>
            <Button type="submit" loading={busy}>{step < 2 ? t('common.next') : t('onboarding.finish')}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <RequireAuth needsOrg={false}>
      <Onboarding />
    </RequireAuth>
  );
}

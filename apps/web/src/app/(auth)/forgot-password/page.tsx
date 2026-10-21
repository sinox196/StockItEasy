'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthLayout } from '@/components/shell/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useI18n } from '@/providers/i18n';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const onError = useErrorToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.auth.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')} footer={<Link href="/login" className="text-secondary hover:underline">{t('common.back')}</Link>}>
      {sent ? (
        <p className="rounded-lg bg-success-soft p-4 text-sm text-success" role="status">{t('auth.resetSent')}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('auth.email')} htmlFor="email">
            <Input id="email" type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy}>{t('auth.sendResetLink')}</Button>
        </form>
      )}
    </AuthLayout>
  );
}

'use client';

import { passwordSchema } from '@stockiteasy/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { AuthLayout } from '@/components/shell/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useI18n } from '@/providers/i18n';

function ResetForm() {
  const { t } = useI18n();
  const params = useSearchParams();
  const onError = useErrorToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(t(parsed.error.issues[0].message));
    setError(undefined);
    setBusy(true);
    try {
      await api.auth.resetPassword(params.get('token') ?? '', password);
      setDone(true);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title={t('auth.resetTitle')}>
      {done ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-success-soft p-4 text-sm text-success" role="status">{t('auth.resetDone')}</p>
          <Button asChild className="w-full"><Link href="/login">{t('auth.login')}</Link></Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('auth.newPassword')} htmlFor="password" error={error} hint={t('auth.passwordHint')}>
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy}>{t('common.save')}</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>;
}

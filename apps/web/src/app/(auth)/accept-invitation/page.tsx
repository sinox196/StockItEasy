'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { AuthLayout } from '@/components/shell/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { session } from '@/lib/session';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function Accept() {
  const { t } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const { status, signIn, reload } = useAuth();
  const onError = useErrorToast();
  const token = params.get('token') ?? '';
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (status === 'authenticated') {
        const r = await api.invitations.acceptExisting(token);
        session.setOrg(r.organizationId);
        await reload();
      } else {
        const r = await api.invitations.accept({ token, fullName, password });
        session.setOrg(r.organizationId);
        if (r.tokens) await signIn(r.tokens.accessToken);
      }
      router.replace('/dashboard');
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('auth.acceptInvitationTitle')}>
      <form onSubmit={submit} className="space-y-4">
        {status !== 'authenticated' && (
          <>
            <Field label={t('auth.fullName')} htmlFor="name"><Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <Field label={t('auth.password')} htmlFor="pw" hint={t('auth.passwordHint')}><Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          </>
        )}
        <Button type="submit" className="w-full" size="lg" loading={busy}>{t('auth.acceptInvitation')}</Button>
      </form>
    </AuthLayout>
  );
}

export default function AcceptInvitationPage() {
  return <Suspense><Accept /></Suspense>;
}

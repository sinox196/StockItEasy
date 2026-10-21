'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthLayout } from '@/components/shell/auth-layout';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/providers/i18n';

function Verify() {
  const { t, te } = useI18n();
  const params = useSearchParams();
  const [state, setState] = useState<'pending' | 'done' | 'error'>('pending');
  const [code, setCode] = useState<string>();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api.auth
      .verifyEmail(params.get('token') ?? '')
      .then(() => setState('done'))
      .catch((e) => {
        setCode(e instanceof ApiError ? e.code : undefined);
        setState('error');
      });
  }, [params]);
  return (
    <AuthLayout title={t('auth.verifyTitle')}>
      <div className="space-y-4" role="status">
        {state === 'pending' && <p className="text-sm text-muted-foreground">{t('auth.verifyPending')}</p>}
        {state === 'done' && <p className="rounded-lg bg-success-soft p-4 text-sm text-success">{t('auth.verifyDone')}</p>}
        {state === 'error' && <p className="rounded-lg bg-danger-soft p-4 text-sm text-danger">{te(code)}</p>}
        <Button asChild className="w-full"><Link href="/dashboard">{t('nav.dashboard')}</Link></Button>
      </div>
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return <Suspense><Verify /></Suspense>;
}

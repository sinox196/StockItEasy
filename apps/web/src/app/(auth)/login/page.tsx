'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthLayout } from '@/components/shell/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useFieldError } from '@/lib/forms';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

const schema = z.object({
  email: z.string().trim().email({ message: 'validation.email' }),
  password: z.string().min(1, { message: 'validation.required' }),
});

function LoginForm() {
  const { t } = useI18n();
  const fe = useFieldError();
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const onError = useErrorToast();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (v) => {
    try {
      const res = await api.auth.login({ ...v, client: 'web' });
      const me = await signIn(res.accessToken);
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : me?.organizations.length ? '/dashboard' : me?.user.isSuperAdmin ? '/admin' : '/onboarding');
    } catch (e) {
      onError(e);
    }
  });

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="font-semibold text-secondary hover:underline">
            {t('auth.registerTitle')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('auth.email')} htmlFor="email" error={fe(formState.errors.email?.message)}>
          <Input id="email" type="email" autoComplete="email" dir="ltr" {...register('email')} aria-invalid={!!formState.errors.email} />
        </Field>
        <Field label={t('auth.password')} htmlFor="password" error={fe(formState.errors.password?.message)}>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} aria-invalid={!!formState.errors.password} />
        </Field>
        <div className="text-end">
          <Link href="/forgot-password" className="text-sm text-secondary hover:underline">
            {t('auth.forgotPassword')}
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          {t('auth.login')}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

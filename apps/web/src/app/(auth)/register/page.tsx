'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@stockiteasy/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthLayout } from '@/components/shell/auth-layout';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useFieldError } from '@/lib/forms';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

type Form = z.input<typeof registerSchema>;

export default function RegisterPage() {
  const { t, locale } = useI18n();
  const fe = useFieldError();
  const { signIn } = useAuth();
  const router = useRouter();
  const onError = useErrorToast();
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(registerSchema), defaultValues: { locale } });

  const onSubmit = handleSubmit(async (v) => {
    try {
      const res = await api.auth.register({ fullName: v.fullName, email: v.email, password: v.password, locale, acceptTerms: true });
      await signIn(res.accessToken);
      router.replace('/onboarding');
    } catch (e) {
      onError(e);
    }
  });

  return (
    <AuthLayout
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link href="/login" className="font-semibold text-secondary hover:underline">
            {t('auth.login')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('auth.fullName')} htmlFor="fullName" error={fe(formState.errors.fullName?.message)}>
          <Input id="fullName" autoComplete="name" {...register('fullName')} />
        </Field>
        <Field label={t('auth.email')} htmlFor="email" error={fe(formState.errors.email?.message)}>
          <Input id="email" type="email" autoComplete="email" dir="ltr" {...register('email')} />
        </Field>
        <Field label={t('auth.password')} htmlFor="password" error={fe(formState.errors.password?.message)} hint={t('auth.passwordHint')}>
          <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <div>
          <Checkbox label={t('auth.acceptTerms')} {...register('acceptTerms')} />
          {formState.errors.acceptTerms && <p className="mt-1 text-xs text-danger">{t('validation.acceptTerms')}</p>}
        </div>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          {t('auth.register')}
        </Button>
      </form>
    </AuthLayout>
  );
}

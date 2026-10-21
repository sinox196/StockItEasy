'use client';

import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@stockiteasy/i18n';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={cn('inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs', className)} role="group" aria-label={t('common.language')}>
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn('rounded-md px-2.5 py-1 font-medium', l === locale ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          aria-pressed={l === locale}
        >
          {l === 'ar-TN' ? 'دارجة' : LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-navy-900 via-[#0b2a63] to-blue-700 p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/icon.png" alt="" width={40} height={40} />
          <span className="text-xl font-bold">StockItEasy</span>
        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight">{t('landing.heroTitle')}</h2>
          <p className="mt-4 text-blue-100">{t('landing.heroSubtitle')}</p>
        </div>
        <p className="text-sm text-blue-200">{t('landing.footer', { year: new Date().getFullYear() })}</p>
        <div className="pointer-events-none absolute -bottom-24 -end-24 size-96 rounded-full bg-emerald-400/20 blur-3xl" />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4">
          <Link href="/" className="flex items-center gap-2 lg:invisible">
            <Image src="/icon.png" alt="" width={32} height={32} />
            <span className="font-bold">StockItEasy</span>
          </Link>
          <LanguageSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

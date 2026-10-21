'use client';

import { PLANS } from '@stockiteasy/shared';
import { ArrowRight, Boxes, Globe2, Languages, ScanBarcode, ShieldCheck, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/shell/auth-layout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

const FEATURES = [
  { icon: Boxes, title: 'landing.f1Title', text: 'landing.f1Text' },
  { icon: ScanBarcode, title: 'landing.f2Title', text: 'landing.f2Text' },
  { icon: Sparkles, title: 'landing.f3Title', text: 'landing.f3Text' },
  { icon: Globe2, title: 'landing.f4Title', text: 'landing.f4Text' },
  { icon: Languages, title: 'landing.f5Title', text: 'landing.f5Text' },
  { icon: ShieldCheck, title: 'landing.f6Title', text: 'landing.f6Text' },
];

export default function LandingPage() {
  const { t } = useI18n();
  const { status } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/icon.png" alt="" width={34} height={34} priority />
            <span className="text-lg font-bold">Stock<span className="text-secondary">It</span><span className="text-accent">Easy</span></span>
          </Link>
          <nav className="ms-6 hidden gap-5 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">{t('landing.navFeatures')}</a>
            <a href="#pricing" className="hover:text-foreground">{t('landing.pricingTitle')}</a>
            <a href="#faq" className="hover:text-foreground">{t('landing.faqTitle')}</a>
            <a href="#contact" className="hover:text-foreground">{t('landing.contactTitle')}</a>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            {status === 'authenticated' ? (
              <Button asChild size="sm"><Link href="/dashboard">{t('nav.dashboard')}</Link></Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost"><Link href="/login">{t('landing.ctaLogin')}</Link></Button>
                <Button asChild size="sm"><Link href="/register">{t('landing.ctaStart')}</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-navy-900 via-[#0b2a63] to-blue-700 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2">
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{t('landing.heroTitle')}</h1>
            <p className="mt-5 max-w-xl text-lg text-blue-100">{t('landing.heroSubtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent"><Link href="/register">{t('landing.ctaStart')} <ArrowRight className="rtl:rotate-180" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20"><Link href="/login">{t('landing.ctaLogin')}</Link></Button>
            </div>
            <LanguageSwitcher className="mt-6 sm:hidden" />
          </div>
          <div className="flex justify-center">
            <Image src="/logo.png" alt="StockItEasy" width={420} height={300} className="rounded-3xl bg-white/95 p-6 shadow-2xl" priority />
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">{t('landing.featuresTitle')}</h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <div className="inline-flex rounded-lg bg-info-soft p-2.5 text-secondary"><f.icon className="size-5" /></div>
              <h3 className="mt-4 font-semibold">{t(f.title)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(f.text)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-y border-border bg-surface py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">{t('landing.pricingTitle')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">{t('landing.pricingSubtitle')}</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div key={p} className="card flex flex-col p-6">
                <h3 className="text-lg font-bold">{t(`plans.${p}`)}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{t('landing.pricingSubtitle')}</p>
                <Button asChild variant={p === 'PRO_AI' ? 'secondary' : 'outline'} className="mt-6"><a href="#contact">{t('landing.pricingContact')}</a></Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">{t('landing.faqTitle')}</h2>
        <div className="mt-10 space-y-3">
          {[1, 2, 3].map((i) => (
            <details key={i} className="card group p-5">
              <summary className="cursor-pointer font-semibold">{t(`landing.faq${i}q`)}</summary>
              <p className="mt-3 text-sm text-muted-foreground">{t(`landing.faq${i}a`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="contact" className="bg-navy-900 py-16 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold">{t('landing.contactTitle')}</h2>
          <p className="mt-3 text-blue-100">{t('landing.contactText')}</p>
          {process.env.NEXT_PUBLIC_CONTACT_EMAIL && <Button asChild className="mt-6" variant="accent"><a href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}`}>{process.env.NEXT_PUBLIC_CONTACT_EMAIL}</a></Button>}
        </div>
      </section>
      <footer className="py-8 text-center text-sm text-muted-foreground">{t('landing.footer', { year: new Date().getFullYear() })}</footer>
    </div>
  );
}

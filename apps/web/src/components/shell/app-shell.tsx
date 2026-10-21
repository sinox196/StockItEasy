'use client';

import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@stockiteasy/i18n';
import * as DM from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { Bell, Building2, Check, LogOut, Menu, Monitor, Moon, Search, ShieldCheck, Sun, User, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';
import { NAV } from './nav';

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { can, me } = useAuth();
  const pathname = usePathname();
  return (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4" aria-label="Main">
      <Link href="/dashboard" className="flex items-center gap-2 px-2" onClick={onNavigate}>
        <Image src="/icon.png" alt="" width={34} height={34} priority />
        <span className="text-lg font-bold tracking-tight text-white">
          Stock<span className="text-blue-400">It</span>
          <span className="text-emerald-400">Easy</span>
        </span>
      </Link>
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.permission || can(i.permission));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t(g.group)}</p>
            <ul className="space-y-0.5">
              {items.map((i) => {
                const active = pathname === i.href || (i.href !== '/settings' && pathname.startsWith(i.href + '/'));
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white',
                        active && 'bg-white/10 text-white',
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      <i.icon className="size-4 shrink-0" aria-hidden />
                      {t(i.label)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {me?.user.isSuperAdmin && (
        <Link href="/admin" onClick={onNavigate} className="mx-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-amber-300 hover:bg-white/10">
          <ShieldCheck className="size-4" /> {t('admin.title')}
        </Link>
      )}
    </nav>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const products = useQuery({
    queryKey: ['palette-products', search],
    queryFn: () => api.products.list({ search, pageSize: 6 }),
    enabled: open && search.length >= 2 && can('products.read'),
  });
  if (!open) return null;
  const go = (href: string) => {
    onOpenChange(false);
    setSearch('');
    router.push(href);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-[12vh]" onClick={() => onOpenChange(false)}>
      <Command className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()} label={t('common.commandPalette')} shouldFilter={false}>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 text-muted-foreground" />
          <Command.Input autoFocus value={search} onValueChange={setSearch} placeholder={t('common.searchPlaceholder')} className="h-12 flex-1 bg-transparent text-sm outline-none" />
          <kbd className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="p-4 text-center text-sm text-muted-foreground">{t('common.noResults')}</Command.Empty>
          {products.data?.items.length ? (
            <Command.Group heading={t('common.products')} className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
              {products.data.items.map((p) => (
                <Command.Item key={p.id} value={`p-${p.id}`} onSelect={() => go(`/products/${p.id}`)} className="flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted">
                  <span>{p.name}</span>
                  <bdi dir="ltr" className="text-xs text-muted-foreground">{p.sku}</bdi>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          <Command.Group heading={t('common.goTo')} className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            {NAV.flatMap((g) => g.items)
              .filter((i) => (!i.permission || can(i.permission)) && (!search || t(i.label).toLowerCase().includes(search.toLowerCase())))
              .map((i) => (
                <Command.Item key={i.href} value={i.href} onSelect={() => go(i.href)} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted">
                  <i.icon className="size-4 text-muted-foreground" />
                  {t(i.label)}
                </Command.Item>
              ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function UserMenu() {
  const { t, locale, setLocale } = useI18n();
  const { me, org, signOut, selectOrg } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const item = 'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted';
  return (
    <DM.Root>
      <DM.Trigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted" aria-label={t('common.profile')}>
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-bold text-white">{me?.user.fullName.slice(0, 1).toUpperCase()}</span>
        <span className="hidden text-start leading-tight md:block">
          <span className="block max-w-40 truncate text-sm font-semibold">{me?.user.fullName}</span>
          <span className="block max-w-40 truncate text-xs text-muted-foreground">{org?.name}</span>
        </span>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={6} className="z-50 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
          <DM.Label className="px-2 py-1.5 text-xs text-muted-foreground">{me?.user.email}</DM.Label>
          {me && me.organizations.length > 1 && (
            <>
              <DM.Separator className="my-1 h-px bg-border" />
              <DM.Label className="px-2 py-1 text-xs font-semibold text-muted-foreground">{t('onboarding.switchOrganization')}</DM.Label>
              {me.organizations.map((o) => (
                <DM.Item key={o.id} className={item} onSelect={() => { selectOrg(o.id); router.push('/dashboard'); }}>
                  <Building2 className="size-4" />
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.id === org?.id && <Check className="size-4" />}
                </DM.Item>
              ))}
            </>
          )}
          <DM.Item className={item} onSelect={() => router.push('/onboarding?new=1')}>
            <Building2 className="size-4" /> {t('onboarding.newOrganization')}
          </DM.Item>
          <DM.Separator className="my-1 h-px bg-border" />
          <DM.Label className="px-2 py-1 text-xs font-semibold text-muted-foreground">{t('common.language')}</DM.Label>
          {SUPPORTED_LOCALES.map((l) => (
            <DM.Item key={l} className={item} onSelect={() => { setLocale(l); void api.me.update({ locale: l }); }}>
              <span className="flex-1">{LOCALE_LABELS[l]}</span>
              {l === locale && <Check className="size-4" />}
            </DM.Item>
          ))}
          <DM.Separator className="my-1 h-px bg-border" />
          <DM.Label className="px-2 py-1 text-xs font-semibold text-muted-foreground">{t('common.theme')}</DM.Label>
          {([['light', Sun, 'common.themeLight'], ['dark', Moon, 'common.themeDark'], ['system', Monitor, 'common.themeSystem']] as const).map(([v, Icon, label]) => (
            <DM.Item key={v} className={item} onSelect={() => setTheme(v)}>
              <Icon className="size-4" />
              <span className="flex-1">{t(label)}</span>
              {theme === v && <Check className="size-4" />}
            </DM.Item>
          ))}
          <DM.Separator className="my-1 h-px bg-border" />
          <DM.Item className={item} onSelect={() => router.push('/settings/profile')}>
            <User className="size-4" /> {t('common.profile')}
          </DM.Item>
          <DM.Item className={cn(item, 'text-danger')} onSelect={() => void signOut()}>
            <LogOut className="size-4" /> {t('common.logout')}
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { org, me } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const unread = useQuery({
    queryKey: ['notifications-unread', org?.id],
    queryFn: () => api.notifications.list({ unread: 'true', pageSize: 1 }),
    enabled: !!org,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === 'Escape') setPalette(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen bg-gradient-to-b from-navy-900 to-[#0b2350] lg:block">
        <Sidebar />
      </aside>
      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 bg-gradient-to-b from-navy-900 to-[#0b2350]">
            <button className="absolute end-3 top-4 text-white" onClick={() => setMobileNav(false)} aria-label={t('common.close')}>
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setMobileNav(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur lg:px-6">
          <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={() => setMobileNav(true)} aria-label="Menu">
            <Menu className="size-5" />
          </button>
          <button
            onClick={() => setPalette(true)}
            className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:border-secondary/50 sm:max-w-md"
          >
            <Search className="size-4" />
            <span className="truncate">{t('common.searchPlaceholder')}</span>
            <kbd className="ms-auto hidden rounded border border-border px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="ms-auto flex items-center gap-2">
            {org?.isDemo && <Badge tone="demo">{t('app.demoBadge')}</Badge>}
            <Link href="/notifications" className="relative rounded-lg p-2 hover:bg-muted" aria-label={t('common.notifications')}>
              <Bell className="size-5" />
              {!!unread.data?.unreadCount && (
                <span className="absolute -end-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {unread.data.unreadCount > 99 ? '99+' : unread.data.unreadCount}
                </span>
              )}
            </Link>
            <UserMenu />
          </div>
        </header>
        {me && !me.user.emailVerified && <VerifyBanner />}
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 lg:p-6">{children}</main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}

function VerifyBanner() {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  return (
    <div className="no-print flex flex-wrap items-center justify-center gap-2 bg-info-soft px-4 py-2 text-center text-sm text-info">
      {t('auth.verifyBanner')}
      <button
        className="font-semibold underline"
        disabled={sent}
        onClick={async () => {
          await api.auth.resendVerification().catch(() => undefined);
          setSent(true);
        }}
      >
        {sent ? t('auth.verificationSent') : t('auth.resendVerification')}
      </button>
    </div>
  );
}

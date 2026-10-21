'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/shell/auth-layout';
import { RequireAuth } from '@/components/shell/require-auth';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

/** Super-admin console lives outside the tenant shell: platform admins need no organization. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { signOut, me } = useAuth();
  return (
    <RequireAuth needsOrg={false}>
      <header className="flex h-16 items-center gap-3 border-b border-border bg-surface px-6">
        <Link href="/admin" className="font-bold">StockItEasy · {t('admin.title')}</Link>
        <div className="ms-auto flex items-center gap-2">
          <LanguageSwitcher />
          {!!me?.organizations.length && <Button asChild size="sm" variant="outline"><Link href="/dashboard">{t('nav.dashboard')}</Link></Button>}
          <Button size="sm" variant="ghost" onClick={() => void signOut()}>{t('common.logout')}</Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </RequireAuth>
  );
}

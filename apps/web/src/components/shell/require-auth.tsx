'use client';

import type { Permission } from '@stockiteasy/shared';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { Skeleton } from '@/components/ui/states';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center" aria-busy="true">
      <div className="w-64 space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

/** Client-side gate; the API enforces every permission regardless. */
export function RequireAuth({ children, needsOrg = true }: { children: ReactNode; needsOrg?: boolean }) {
  const { status, me, org } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (status === 'authenticated' && needsOrg && me && me.organizations.length === 0) router.replace('/onboarding');
  }, [status, me, needsOrg, router, pathname]);
  if (status !== 'authenticated' || (needsOrg && !org)) return <FullPageLoader />;
  return <>{children}</>;
}

export function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  const { te } = useI18n();
  if (!can(permission)) return <div className="card p-10 text-center text-sm text-muted-foreground">{te('FORBIDDEN')}</div>;
  return <>{children}</>;
}

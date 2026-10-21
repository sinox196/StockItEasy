'use client';

import type { Me, OrganizationSummary } from '@stockiteasy/api-client';
import { isSupportedLocale } from '@stockiteasy/i18n';
import type { Permission } from '@stockiteasy/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshWithCookie, setAuthFailureHandler } from '@/lib/api';
import { session } from '@/lib/session';
import { useI18n } from './i18n';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthValue {
  status: Status;
  me: Me | null;
  org: OrganizationSummary | null;
  can: (p: Permission) => boolean;
  reload: () => Promise<Me | null>;
  signIn: (accessToken: string) => Promise<Me | null>;
  signOut: () => Promise<void>;
  selectOrg: (id: string) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const { setLocale, locale } = useI18n();
  const qc = useQueryClient();
  const router = useRouter();

  const load = useCallback(async (): Promise<Me | null> => {
    try {
      const data = await api.me.get();
      setMe(data);
      const saved = session.getOrg();
      const chosen = data.organizations.find((o) => o.id === saved) ?? data.organizations[0] ?? null;
      session.setOrg(chosen?.id ?? null);
      setOrgId(chosen?.id ?? null);
      if (isSupportedLocale(data.user.locale) && data.user.locale !== locale) setLocale(data.user.locale);
      setStatus('authenticated');
      return data;
    } catch {
      setStatus('anonymous');
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAuthFailureHandler(() => {
      session.setToken(null);
      setMe(null);
      setStatus('anonymous');
    });
    (async () => {
      if (!session.getToken()) {
        const token = await refreshWithCookie().catch(() => null);
        if (!token) {
          setStatus('anonymous');
          return;
        }
      }
      await load();
    })();
  }, [load]);

  const signIn = useCallback(
    async (token: string) => {
      session.setToken(token);
      return load();
    },
    [load],
  );

  const signOut = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    session.setToken(null);
    setMe(null);
    setStatus('anonymous');
    qc.clear();
    router.replace('/login');
  }, [qc, router]);

  const selectOrg = useCallback(
    (id: string) => {
      session.setOrg(id);
      setOrgId(id);
      qc.clear();
    },
    [qc],
  );

  const org = useMemo(() => me?.organizations.find((o) => o.id === orgId) ?? null, [me, orgId]);
  const can = useCallback((p: Permission) => !!org?.role.permissions.includes(p), [org]);

  return <AuthContext.Provider value={{ status, me, org, can, reload: load, signIn, signOut, selectOrg }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

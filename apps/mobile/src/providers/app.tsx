import NetInfo from '@react-native-community/netinfo';
import type { Me, OrganizationSummary, SyncSnapshot } from '@stockiteasy/api-client';
import { darkColors, lightColors, ThemeColors } from '@stockiteasy/design-tokens';
import {
  AppLocale,
  createTranslator,
  direction,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  isSupportedLocale,
  translateError,
  TranslateParams,
} from '@stockiteasy/i18n';
import type { Permission } from '@stockiteasy/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, useColorScheme, View } from 'react-native';
import { api, ApiError, refreshSession, setAuthFailureHandler, setLocaleGetter } from '../lib/api';
import { kv, SqliteOpStore } from '../lib/db';
import { session } from '../lib/session';
import { QueuedOp, SyncEngine, SyncReport } from '../lib/sync-core';

/* --------------------------------- i18n --------------------------------- */

interface I18nValue {
  locale: AppLocale;
  dir: 'ltr' | 'rtl';
  t: (key: string, params?: TranslateParams) => string;
  te: (code?: string) => string;
  setLocale: (l: AppLocale) => void;
  money: (v: string | number | null | undefined, currency?: string) => string;
  num: (v: string | number | null | undefined, digits?: number) => string;
  pct: (v: string | number | null | undefined) => string;
  date: (v: string | Date | null | undefined) => string;
  dateTime: (v: string | Date | null | undefined) => string;
}
const I18nCtx = createContext<I18nValue | null>(null);
export const useI18n = () => useContext(I18nCtx)!;

/* --------------------------------- theme -------------------------------- */

const ThemeCtx = createContext<ThemeColors>(lightColors);
export const useColors = () => useContext(ThemeCtx);

/* --------------------------------- auth --------------------------------- */

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';
interface AuthValue {
  status: AuthStatus;
  me: Me | null;
  org: OrganizationSummary | null;
  can: (p: Permission) => boolean;
  signIn: (email: string, password: string) => Promise<Me | null>;
  signOut: () => Promise<void>;
  selectOrg: (id: string) => Promise<void>;
  reload: () => Promise<Me | null>;
}
const AuthCtx = createContext<AuthValue | null>(null);
export const useAuth = () => useContext(AuthCtx)!;

/* --------------------------------- sync --------------------------------- */

interface SyncValue {
  online: boolean;
  pending: QueuedOp[];
  issues: QueuedOp[];
  lastSync: string | null;
  syncing: boolean;
  snapshot: SyncSnapshot | null;
  enqueue: SyncEngine['enqueue'];
  syncNow: () => Promise<SyncReport | null>;
  refreshSnapshot: () => Promise<void>;
  resolve: (id: string, choice: 'keep' | 'discard') => Promise<void>;
}
const SyncCtx = createContext<SyncValue | null>(null);
export const useSync = () => useContext(SyncCtx)!;

function useSyncState(enabled: boolean, orgId: string | null): SyncValue {
  const engineRef = useRef<SyncEngine | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<QueuedOp[]>([]);
  const [issues, setIssues] = useState<QueuedOp[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [snapshot, setSnapshot] = useState<SyncSnapshot | null>(null);

  const engine = useCallback(async () => {
    if (!engineRef.current) {
      let deviceId = await kv.get<string>('deviceId');
      if (!deviceId) {
        deviceId = Crypto.randomUUID();
        await kv.set('deviceId', deviceId);
      }
      engineRef.current = new SyncEngine(new SqliteOpStore(), { push: (d, ops) => api.sync.push({ deviceId: d, operations: ops }) }, deviceId, () => Crypto.randomUUID());
    }
    return engineRef.current;
  }, []);

  const refreshLists = useCallback(async () => {
    const e = await engine();
    setPending(await e.pending());
    setIssues(await e.issues());
  }, [engine]);

  const syncNow = useCallback(async () => {
    if (!enabled) return null;
    setSyncing(true);
    try {
      const report = await (await engine()).sync();
      if (report.ok && report.serverTime) {
        setLastSync(report.serverTime);
        await kv.set(`lastSync:${orgId}`, report.serverTime);
      }
      return report;
    } finally {
      await refreshLists();
      setSyncing(false);
    }
  }, [enabled, engine, refreshLists, orgId]);

  const refreshSnapshot = useCallback(async () => {
    if (!enabled || !orgId) return;
    const snap = await api.sync.snapshot();
    setSnapshot(snap);
    await kv.set(`snapshot:${orgId}`, snap);
    setLastSync(snap.serverTime);
    await kv.set(`lastSync:${orgId}`, snap.serverTime);
  }, [enabled, orgId]);

  useEffect(() => {
    if (!enabled || !orgId) return;
    void (async () => {
      setSnapshot(await kv.get<SyncSnapshot>(`snapshot:${orgId}`));
      setLastSync(await kv.get<string>(`lastSync:${orgId}`));
      await refreshLists();
      await syncNow();
      await refreshSnapshot().catch(() => undefined);
    })();
    const unsubscribe = NetInfo.addEventListener((s) => {
      const isOnline = !!s.isConnected && s.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline) void syncNow().then(() => refreshSnapshot().catch(() => undefined));
    });
    const appState = AppState.addEventListener('change', (st) => st === 'active' && void syncNow());
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [enabled, orgId, refreshLists, syncNow, refreshSnapshot]);

  const enqueue: SyncEngine['enqueue'] = useCallback(
    async (type, payload, opts) => {
      const op = await (await engine()).enqueue(type, payload, opts);
      await refreshLists();
      void syncNow();
      return op;
    },
    [engine, refreshLists, syncNow],
  );

  const resolve = useCallback(
    async (id: string, choice: 'keep' | 'discard') => {
      await (await engine()).resolve(id, choice);
      await refreshLists();
      if (choice === 'keep') void syncNow();
    },
    [engine, refreshLists, syncNow],
  );

  return { online, pending, issues, lastSync, syncing, snapshot, enqueue, syncNow, refreshSnapshot, resolve };
}

/* -------------------------------- provider ------------------------------- */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2 },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const [locale, setLocaleState] = useState<AppLocale>('fr-TN');
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    setLocaleGetter(() => locale);
  }, [locale]);

  const setLocale = useCallback((l: AppLocale) => {
    setLocaleState(l);
    void kv.set('locale', l);
    if (session.getToken()) void api.me.update({ locale: l }).catch(() => undefined);
  }, []);

  const i18n = useMemo<I18nValue>(() => {
    const t = createTranslator(locale);
    return {
      locale,
      dir: direction(locale),
      t,
      te: (c) => translateError(locale, c),
      setLocale,
      money: (v, c = 'TND') => formatMoney(v, locale, c),
      num: (v, d = 3) => formatNumber(v, locale, { maximumFractionDigits: d }),
      pct: (v) => formatPercent(v, locale),
      date: (v) => formatDate(v, locale),
      dateTime: (v) => formatDateTime(v, locale),
    };
  }, [locale, setLocale]);

  const load = useCallback(async () => {
    try {
      const data = await api.me.get();
      setMe(data);
      const saved = await kv.get<string>('orgId');
      const chosen = data.organizations.find((o) => o.id === saved) ?? data.organizations[0] ?? null;
      session.setOrg(chosen?.id ?? null);
      setOrgId(chosen?.id ?? null);
      if (isSupportedLocale(data.user.locale)) setLocaleState(data.user.locale);
      setStatus('authenticated');
      return data;
    } catch {
      setStatus('anonymous');
      return null;
    }
  }, []);

  useEffect(() => {
    setAuthFailureHandler(() => {
      session.setToken(null);
      setStatus('anonymous');
    });
    void (async () => {
      const savedLocale = await kv.get<string>('locale');
      if (isSupportedLocale(savedLocale)) setLocaleState(savedLocale);
      const token = await refreshSession();
      if (!token) return setStatus('anonymous');
      await load();
    })();
  }, [load]);

  const auth = useMemo<AuthValue>(() => {
    const org = me?.organizations.find((o) => o.id === orgId) ?? null;
    return {
      status,
      me,
      org,
      can: (p) => !!org?.role.permissions.includes(p),
      reload: load,
      signIn: async (email, password) => {
        const res = await api.auth.login({ email, password, client: 'mobile', deviceName: 'StockItEasy mobile' });
        session.setToken(res.accessToken);
        await session.setRefreshToken(res.refreshToken ?? null);
        return load();
      },
      signOut: async () => {
        await api.auth.logout().catch(() => undefined);
        session.setToken(null);
        await session.setRefreshToken(null);
        queryClient.clear();
        setMe(null);
        setStatus('anonymous');
      },
      selectOrg: async (id) => {
        session.setOrg(id);
        setOrgId(id);
        await kv.set('orgId', id);
        queryClient.clear();
      },
    };
  }, [status, me, orgId, load]);

  const sync = useSyncState(status === 'authenticated' && !!orgId, orgId);

  return (
    <ThemeCtx.Provider value={colors}>
      <I18nCtx.Provider value={i18n}>
        <QueryClientProvider client={queryClient}>
          <AuthCtx.Provider value={auth}>
            <SyncCtx.Provider value={sync}>
              {/* Layout direction follows the language: rows, paddings and alignment mirror in Arabic. */}
              <View style={{ flex: 1, direction: i18n.dir, backgroundColor: colors.background }}>{children}</View>
            </SyncCtx.Provider>
          </AuthCtx.Provider>
        </QueryClientProvider>
      </I18nCtx.Provider>
    </ThemeCtx.Provider>
  );
}

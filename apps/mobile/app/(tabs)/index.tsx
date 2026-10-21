import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Badge, Card, ErrorView, Kpi, Loading, Num, Row, Text } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth, useColors, useI18n, useSync } from '../../src/providers/app';

export default function Home() {
  const { t, money, num, dateTime } = useI18n();
  const { me, org, can } = useAuth();
  const { pending, issues, lastSync, online } = useSync();
  const c = useColors();
  const router = useRouter();
  const summary = useQuery({ queryKey: ['dashboard', org?.id], queryFn: () => api.dashboard.summary(), enabled: can('dashboard.read') && online });
  const k = summary.data?.kpis;
  const actions = [
    { icon: 'barcode-outline', label: t('mobile.scan'), href: '/(tabs)/scan', show: true },
    { icon: 'create-outline', label: t('mobile.quickAdjust'), href: '/adjust', show: can('inventory.create') },
    { icon: 'clipboard-outline', label: t('mobile.physicalCount'), href: '/counts', show: can('stock_counts.read') },
    { icon: 'swap-horizontal-outline', label: t('nav.transfers'), href: '/transfer', show: can('transfers.create') },
    { icon: 'download-outline', label: t('purchases.receive'), href: '/receiving', show: can('purchases.update') },
    { icon: 'sparkles-outline', label: t('autopilot.title'), href: '/autopilot', show: can('autopilot.read') },
  ] as const;
  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ padding: 16, gap: 14 }} refreshControl={<RefreshControl refreshing={summary.isFetching} onRefresh={() => summary.refetch()} />}>
      <View style={{ backgroundColor: c.primary, borderRadius: 20, padding: 18, gap: 4 }}>
        <Text size={22} weight="800" style={{ color: '#fff' }}>{t('dashboard.welcome', { name: me?.user.fullName.split(' ')[0] ?? '' })}</Text>
        <Text style={{ color: '#CBD5E1' }}>{org?.name}</Text>
        <Row style={{ marginTop: 6 }}>
          {org?.isDemo && <Badge label={t('app.demoBadge')} tone="warning" />}
          <Badge label={pending.length ? t('sync.pending', { count: pending.length }) : t('sync.synced')} tone={pending.length ? 'warning' : 'success'} />
          {issues.length > 0 && <Badge label={t('sync.conflicts')} tone="danger" />}
        </Row>
        <Text size={12} style={{ color: '#94A3B8' }}>{lastSync ? t('sync.lastSync', { date: dateTime(lastSync) }) : t('sync.never')}</Text>
      </View>

      <Text weight="700">{t('mobile.quickActions')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {actions.filter((a) => a.show).map((a) => (
          <Pressable key={a.href} onPress={() => router.push(a.href as never)} accessibilityRole="button" style={({ pressed }) => ({ flexBasis: '31%', flexGrow: 1, minHeight: 84, backgroundColor: pressed ? c.surfaceMuted : c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 })}>
            <Ionicons name={a.icon as keyof typeof Ionicons.glyphMap} size={24} color={c.secondary} />
            <Text size={12} weight="600" style={{ textAlign: 'center' }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {can('dashboard.read') && (
        summary.isLoading ? <Loading /> : summary.error ? <ErrorView error={summary.error} onRetry={() => summary.refetch()} /> : k ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Kpi label={t('dashboard.stockValue')} value={money(k.stockValue, org?.currency)} />
              <Kpi label={t('dashboard.salesToday')} value={money(k.salesToday, org?.currency)} tone="success" />
              <Kpi label={t('dashboard.outOfStock')} value={k.outOfStock} tone={k.outOfStock ? 'danger' : undefined} />
              <Kpi label={t('dashboard.lowStock')} value={k.lowStock} tone={k.lowStock ? 'warning' : undefined} />
            </View>
            {summary.data!.alerts.lowStock.length + summary.data!.alerts.outOfStock.length > 0 && (
              <Card>
                <Text weight="700">{t('dashboard.alerts')}</Text>
                {[...summary.data!.alerts.outOfStock, ...summary.data!.alerts.lowStock].slice(0, 6).map((a) => (
                  <Pressable key={a.id} onPress={() => router.push(`/product/${a.id}`)}>
                    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                      <Text style={{ flex: 1 }}>{a.name}</Text>
                      <Num style={{ color: Number(a.available) <= 0 ? c.danger : '#B45309' }}>{num(a.available)} / {num(a.minStock)}</Num>
                    </Row>
                  </Pressable>
                ))}
              </Card>
            )}
          </>
        ) : null
      )}
    </ScrollView>
  );
}

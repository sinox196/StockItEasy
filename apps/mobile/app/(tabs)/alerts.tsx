import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';
import { Button, Empty, ErrorView, ListItem, Loading } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth, useColors, useI18n, useSync } from '../../src/providers/app';

export default function Alerts() {
  const { t, dateTime, num } = useI18n();
  const { org } = useAuth();
  const { online } = useSync();
  const c = useColors();
  const qc = useQueryClient();
  const router = useRouter();
  const query = useQuery({ queryKey: ['m-notifications', org?.id], queryFn: () => api.notifications.list({ pageSize: 50 }), enabled: online });
  const fmt = (p: Record<string, string | number>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, k === 'available' || k === 'min' ? num(v) : v]));
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ padding: 12 }}>
        <Button title={t('notifications.markAllRead')} variant="outline" onPress={async () => { await api.notifications.readAll(); await qc.invalidateQueries({ queryKey: ['m-notifications'] }); }} />
      </View>
      <FlatList
        data={query.data?.items ?? []}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => query.refetch()} />}
        ListEmptyComponent={<Empty text={t('notifications.empty')} />}
        renderItem={({ item }) => (
          <ListItem
            title={t(`notifications.${item.type}`, fmt(item.params))}
            subtitle={dateTime(item.createdAt)}
            right={!item.readAt ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.secondary }} /> : undefined}
            onPress={async () => {
              await api.notifications.read(item.id).catch(() => undefined);
              void qc.invalidateQueries({ queryKey: ['m-notifications'] });
              const m = item.link?.match(/^\/products\/(.+)$/);
              if (m) router.push(`/product/${m[1]}`);
            }}
          />
        )}
      />
    </View>
  );
}

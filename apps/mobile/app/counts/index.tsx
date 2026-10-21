import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { Badge, Empty, ListItem, Loading, Text } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useColors, useI18n, useSync } from '../../src/providers/app';

/** Open counts: from the server when online, from the downloaded mission when offline. */
export default function Counts() {
  const { t, date } = useI18n();
  const { online, snapshot } = useSync();
  const c = useColors();
  const router = useRouter();
  const query = useQuery({ queryKey: ['m-counts'], queryFn: () => api.counts.list({ status: 'IN_PROGRESS', pageSize: 50 }), enabled: online });
  const items = online
    ? query.data?.items.map((x) => ({ id: x.id, number: x.number, sub: `${x.warehouseName ?? ''} · ${date(x.createdAt)}`, progress: t('counts.progress', { counted: x.countedLines ?? 0, total: x.totalLines ?? 0 }) }))
    : snapshot?.counts.map((x) => ({ id: x.id, number: x.number, sub: snapshot.warehouses.find((w) => w.id === x.warehouseId)?.name ?? '', progress: t('counts.progress', { counted: x.lines.filter((l) => l.countedQty !== null).length, total: x.lines.length }) }));
  if (online && query.isLoading) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Text muted style={{ padding: 16 }}>{t('mobile.chooseCount')}</Text>
      <FlatList
        data={items ?? []}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={<Empty text={t('counts.empty')} />}
        renderItem={({ item }) => <ListItem title={item.number} subtitle={item.sub} right={<Badge label={item.progress} tone="info" />} onPress={() => router.push(`/counts/${item.id}`)} />}
      />
    </View>
  );
}

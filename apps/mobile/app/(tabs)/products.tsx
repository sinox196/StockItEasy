import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Badge, Empty, ErrorView, Input, ListItem, Loading, Num } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth, useColors, useI18n, useSync } from '../../src/providers/app';

/** Online: live catalogue. Offline: the last synchronised snapshot. */
export default function Products() {
  const { t, num, money } = useI18n();
  const { org } = useAuth();
  const { online, snapshot } = useSync();
  const c = useColors();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['m-products', org?.id, search], queryFn: () => api.products.list({ search, pageSize: 50, sort: 'name', order: 'asc' }), enabled: online });
  const offlineItems = useMemo(() => {
    if (online || !snapshot) return [];
    const s = search.toLowerCase();
    return snapshot.products
      .filter((p) => !s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.barcodes.some((b) => b.code === search))
      .slice(0, 100)
      .map((p) => {
        const available = p.balances.reduce((a, b) => a + Number(b.quantityOnHand) - Number(b.quantityReserved) - Number(b.quantityBlocked), 0);
        return { id: p.id, name: p.name, sku: p.sku, available, state: available <= 0 ? 'OUT' : available < Number(p.minStock) ? 'LOW' : 'OK', price: p.salePrice };
      });
  }, [online, snapshot, search]);
  const items = online
    ? query.data?.items.map((p) => ({ id: p.id, name: p.name, sku: p.sku, available: Number(p.stock.available), state: p.stock.state, price: p.salePriceTtc }))
    : offlineItems;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ padding: 12 }}><Input placeholder={t('common.searchPlaceholder')} value={search} onChangeText={setSearch} autoCapitalize="none" /></View>
      {online && query.isLoading ? <Loading /> : online && query.error ? <ErrorView error={query.error} onRetry={() => query.refetch()} /> : (
        <FlatList
          data={items ?? []}
          keyExtractor={(p) => p.id}
          ListEmptyComponent={<Empty text={t('products.empty')} />}
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              subtitle={<Num size={12} weight="400" style={{ color: c.textMuted }}>{item.sku} · {money(item.price, org?.currency)}</Num>}
              onPress={() => router.push(`/product/${item.id}`)}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Num>{num(item.available)}</Num>
                  <Badge label={t(`products.state${item.state}`)} tone={item.state === 'OK' ? 'success' : item.state === 'LOW' ? 'warning' : 'danger'} />
                </View>
              }
            />
          )}
        />
      )}
    </View>
  );
}

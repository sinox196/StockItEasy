import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, ErrorView, Kpi, Loading, Num, Row, Screen, Text } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth, useColors, useI18n } from '../../src/providers/app';
import { View } from 'react-native';

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, num, money, dateTime } = useI18n();
  const { can, org } = useAuth();
  const c = useColors();
  const router = useRouter();
  const product = useQuery({ queryKey: ['m-product', id], queryFn: () => api.products.get(id) });
  const movements = useQuery({ queryKey: ['m-movements', id], queryFn: () => api.inventory.movements({ productId: id, pageSize: 10 }), enabled: can('inventory.read') });
  if (product.isLoading) return <Loading />;
  if (product.error || !product.data) return <Screen><ErrorView error={product.error} onRetry={() => product.refetch()} /></Screen>;
  const p = product.data;
  return (
    <Screen>
      <Text size={20} weight="800">{p.name}</Text>
      <Row>
        <Num weight="400" style={{ color: c.textMuted }}>{p.sku}</Num>
        <Badge label={t(`products.state${p.stock.state}`)} tone={p.stock.state === 'OK' ? 'success' : p.stock.state === 'LOW' ? 'warning' : 'danger'} />
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Kpi label={t('products.available')} value={`${num(p.stock.available)} ${p.baseUnit}`} />
        <Kpi label={t('products.salePriceTtc')} value={money(p.salePriceTtc, org?.currency)} />
        <Kpi label={t('products.reserved')} value={num(p.stock.reserved)} />
        <Kpi label={t('products.blocked')} value={num(p.stock.blocked)} />
      </View>
      {can('inventory.create') && <Button title={t('mobile.quickAdjust')} variant="secondary" onPress={() => router.push({ pathname: '/adjust', params: { productId: p.id, name: p.name } })} />}
      <Card>
        <Text weight="700">{t('products.stockByWarehouse')}</Text>
        {p.balances.map((b) => (
          <Row key={b.id} style={{ justifyContent: 'space-between' }}>
            <Text style={{ flex: 1 }}>{b.warehouse.name}</Text>
            <Num>{num(Number(b.quantityOnHand) - Number(b.quantityReserved) - Number(b.quantityBlocked))}</Num>
          </Row>
        ))}
      </Card>
      {movements.data && (
        <Card>
          <Text weight="700">{t('products.history')}</Text>
          {movements.data.items.map((m) => (
            <Row key={m.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text size={14}>{t(`movements.types.${m.type}`)}</Text>
                <Text muted size={12}>{dateTime(m.occurredAt)}</Text>
              </View>
              <Num style={{ color: Number(m.quantity) >= 0 ? c.success : c.danger }}>{Number(m.quantity) > 0 ? '+' : ''}{num(m.quantity)}</Num>
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}

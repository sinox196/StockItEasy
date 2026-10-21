import { newIdempotencyKey, PurchaseOrder } from '@stockiteasy/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Scanner } from '../src/components/scanner';
import { Badge, Button, Card, Empty, Input, ListItem, Loading, Num, Row, Screen, Text } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth, useI18n, useSync } from '../src/providers/app';

/** Purchase receiving on the dock: pick an order, scan or type received quantities, post the receipt. */
export default function Receiving() {
  const { t, te, num, money, date } = useI18n();
  const { org } = useAuth();
  const { online } = useSync();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [key] = useState(newIdempotencyKey);
  const [busy, setBusy] = useState(false);
  const open = useQuery({
    queryKey: ['m-open-pos'],
    queryFn: async () => {
      const [a, b, c] = await Promise.all(['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].map((status) => api.purchases.list({ status, pageSize: 50 })));
      return [...a.items, ...b.items, ...c.items];
    },
    enabled: online,
  });
  const po = useQuery({ queryKey: ['m-po', selected], queryFn: () => api.purchases.get(selected!), enabled: !!selected });
  if (!online) return <Screen><Text>{t('mobile.offlineBanner')}</Text></Screen>;
  if (!selected) {
    if (open.isLoading) return <Loading />;
    return (
      <Screen padded={false}>
        {open.data?.length ? open.data.map((p: PurchaseOrder) => (
          <ListItem key={p.id} title={`${p.number} · ${p.supplier.name}`} subtitle={`${date(p.expectedDate)} · ${money(p.total, org?.currency)}`} right={<Badge label={t(`purchases.statuses.${p.status}`)} tone="info" />} onPress={() => setSelected(p.id)} />
        )) : <Empty text={t('purchases.empty')} />}
      </Screen>
    );
  }
  const lines = po.data?.lines?.filter((l) => Number(l.remaining) > 0) ?? [];
  const receive = async () => {
    setBusy(true);
    try {
      const body = { lines: Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([lineId, quantity]) => ({ lineId, quantity })) };
      await api.purchases.receive(selected, body, key);
      Alert.alert(t('purchases.goodsReceived'));
      await qc.invalidateQueries();
      setSelected(null);
      setQty({});
    } catch (e) {
      Alert.alert(t('common.errorTitle'), te((e as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Text weight="800" size={18}>{po.data?.number}</Text>
      <Scanner height={180} onCode={async (code) => {
        const r = await api.products.lookup(code).catch(() => null);
        const line = r && lines.find((l) => l.productId === r.product.id);
        if (line) setQty((q) => ({ ...q, [line.id]: String(Math.min(Number(q[line.id] ?? 0) + Number(r.unitFactor || 1), Number(line.remaining))) }));
      }} />
      {lines.map((l) => (
        <Card key={l.id}>
          <Text weight="600">{l.product?.name}</Text>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text muted>{t('purchases.remaining')}: <Num>{num(l.remaining)}</Num></Text>
            <View style={{ width: 120 }}><Input value={qty[l.id] ?? ''} placeholder="0" keyboardType="decimal-pad" ltr onChangeText={(v) => setQty({ ...qty, [l.id]: v })} /></View>
          </Row>
          <Button title={`= ${num(l.remaining)}`} variant="ghost" onPress={() => setQty({ ...qty, [l.id]: l.remaining })} />
        </Card>
      ))}
      <Button title={t('common.validate')} variant="accent" loading={busy} disabled={!Object.values(qty).some((v) => Number(v) > 0)} onPress={() => void receive()} />
      <Button title={t('common.back')} variant="outline" onPress={() => setSelected(null)} />
    </Screen>
  );
}

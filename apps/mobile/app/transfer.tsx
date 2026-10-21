import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Scanner } from '../src/components/scanner';
import { Button, Card, Input, Row, Screen, Text } from '../src/components/ui';
import { api } from '../src/lib/api';
import { lookupCode } from '../src/lib/lookup';
import { useColors, useI18n, useSync } from '../src/providers/app';

/** Builds a transfer by scanning; it is created as a draft and shipped from here (online). */
export default function Transfer() {
  const { t, te } = useI18n();
  const c = useColors();
  const router = useRouter();
  const { online, snapshot } = useSync();
  const warehouses = useQuery({ queryKey: ['m-warehouses'], queryFn: api.warehouses.list, enabled: online });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lines, setLines] = useState<{ productId: string; name: string; quantity: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const pick = (value: string, set: (v: string) => void, label: string) => (
    <View style={{ gap: 6 }}>
      <Text weight="600" size={13}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {warehouses.data?.map((w) => (
          <Pressable key={w.id} onPress={() => set(w.id)} style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: value === w.id ? c.secondary : c.border, backgroundColor: value === w.id ? c.infoSoft : c.surface }}>
            <Text size={14}>{w.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  const submit = async (ship: boolean) => {
    setBusy(true);
    try {
      const tr = await api.transfers.create({ fromWarehouseId: from, toWarehouseId: to, lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) });
      if (ship) await api.transfers.ship(tr.id);
      Alert.alert(tr.number, ship ? t('transfers.shipped') : t('common.created'));
      router.back();
    } catch (e) {
      Alert.alert(t('common.errorTitle'), te((e as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  };
  if (!online) return <Screen><Text>{t('mobile.offlineBanner')}</Text></Screen>;
  return (
    <Screen>
      {pick(from, setFrom, t('transfers.from'))}
      {pick(to, setTo, t('transfers.to'))}
      {from && to && from === to && <Text style={{ color: c.danger }}>{t('validation.sameWarehouse')}</Text>}
      <Scanner height={180} onCode={async (code) => {
        const hit = await lookupCode(code, online, snapshot).catch(() => null);
        if (!hit) return;
        setLines((ls) => ls.some((l) => l.productId === hit.productId) ? ls.map((l) => l.productId === hit.productId ? { ...l, quantity: String(Number(l.quantity) + hit.unitFactor) } : l) : [...ls, { productId: hit.productId, name: hit.name, quantity: String(hit.unitFactor) }]);
      }} />
      {lines.map((l, i) => (
        <Card key={l.productId}>
          <Text weight="600">{l.name}</Text>
          <Row>
            <View style={{ flex: 1 }}><Input value={l.quantity} keyboardType="decimal-pad" ltr onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: v } : x)))} /></View>
            <Button title={t('common.removeLine')} variant="ghost" onPress={() => setLines(lines.filter((_, j) => j !== i))} />
          </Row>
        </Card>
      ))}
      <Row>
        <Button title={t('common.save')} variant="outline" style={{ flex: 1 }} disabled={!from || !to || from === to || !lines.length} loading={busy} onPress={() => void submit(false)} />
        <Button title={t('transfers.ship')} style={{ flex: 1 }} disabled={!from || !to || from === to || !lines.length} loading={busy} onPress={() => void submit(true)} />
      </Row>
    </Screen>
  );
}

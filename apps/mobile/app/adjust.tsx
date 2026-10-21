import { ADJUSTMENT_REASONS } from '@stockiteasy/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Scanner } from '../src/components/scanner';
import { Button, Card, Input, Row, Screen, Text } from '../src/components/ui';
import { api } from '../src/lib/api';
import { lookupCode } from '../src/lib/lookup';
import { useColors, useI18n, useSync } from '../src/providers/app';

/** Quick adjustment. Works offline: the operation is queued and synchronised later. */
export default function Adjust() {
  const params = useLocalSearchParams<{ productId?: string; name?: string }>();
  const { t } = useI18n();
  const c = useColors();
  const router = useRouter();
  const { online, snapshot, enqueue } = useSync();
  const [product, setProduct] = useState<{ id: string; name: string } | null>(params.productId ? { id: params.productId, name: params.name ?? '' } : null);
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState<string>('DAMAGED');
  const [warehouseId, setWarehouseId] = useState('');
  const [busy, setBusy] = useState(false);
  const warehouses = useQuery({ queryKey: ['m-warehouses'], queryFn: api.warehouses.list, enabled: online });
  const list = online ? warehouses.data?.map((w) => ({ id: w.id, name: w.name })) : snapshot?.warehouses;
  useEffect(() => {
    if (!warehouseId && list?.length) setWarehouseId(list[0].id);
  }, [list, warehouseId]);

  const save = async () => {
    if (!product || !warehouseId) return;
    setBusy(true);
    try {
      await enqueue('STOCK_ADJUSTMENT', { productId: product.id, warehouseId, direction, quantity: quantity.replace(',', '.'), reason }, { label: `${product.name} ${direction === 'IN' ? '+' : '-'}${quantity}` });
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const chip = (active: boolean, label: string, onPress: () => void, tone: string = c.secondary) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: active ? tone : c.border, backgroundColor: active ? c.surfaceMuted : c.surface }}>
      <Text weight={active ? '700' : '500'} size={14}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen>
      {!product ? (
        <Scanner height={200} onCode={async (code) => { const hit = await lookupCode(code, online, snapshot).catch(() => null); if (hit) setProduct({ id: hit.productId, name: hit.name }); }} />
      ) : (
        <Card><Text weight="700" size={17}>{product.name}</Text><Button title={t('mobile.scan')} variant="ghost" onPress={() => setProduct(null)} /></Card>
      )}
      <Row>{chip(direction === 'OUT', t('movements.out'), () => setDirection('OUT'), c.danger)}{chip(direction === 'IN', t('movements.in'), () => setDirection('IN'), c.success)}</Row>
      <Input label={t('common.quantity')} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" ltr />
      <Text weight="600" size={13}>{t('common.reason')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{ADJUSTMENT_REASONS.map((r) => chip(reason === r, t(`movements.reasons.${r}`), () => setReason(r)))}</View>
      {list && list.length > 1 && (
        <>
          <Text weight="600" size={13}>{t('common.warehouse')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{list.map((w) => chip(warehouseId === w.id, w.name, () => setWarehouseId(w.id)))}</View>
        </>
      )}
      <Button title={t('common.validate')} onPress={save} loading={busy} disabled={!product || !Number(quantity.replace(',', '.'))} />
      {!online && <Text muted size={12}>{t('mobile.offlineBanner')}</Text>}
    </Screen>
  );
}

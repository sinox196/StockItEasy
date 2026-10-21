import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Scanner } from '../../src/components/scanner';
import { Badge, Button, Card, Num, Row, Screen, Text } from '../../src/components/ui';
import { lookupCode, ScanHit } from '../../src/lib/lookup';
import { useAuth, useColors, useI18n, useSync } from '../../src/providers/app';

export default function Scan() {
  const { t, te, num } = useI18n();
  const { can } = useAuth();
  const { online, snapshot } = useSync();
  const c = useColors();
  const router = useRouter();
  const [hit, setHit] = useState<ScanHit | null>(null);
  const [message, setMessage] = useState<string>();

  const onCode = async (code: string) => {
    setMessage(undefined);
    try {
      const r = await lookupCode(code, online, snapshot);
      setHit(r);
      if (!r) setMessage(t('pos.notFound', { code }));
    } catch (e) {
      setMessage(te((e as { code?: string }).code));
    }
  };

  return (
    <Screen>
      <Scanner onCode={onCode} />
      {message && <Text style={{ color: c.danger }}>{message}</Text>}
      {hit && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text weight="700" size={17} style={{ flex: 1 }}>{hit.name}</Text>
            {hit.source === 'offline' && <Badge label={t('common.offline')} tone="warning" />}
          </Row>
          <Num weight="400" style={{ color: c.textMuted }}>{hit.sku}{hit.unitFactor !== 1 ? ` · ×${hit.unitFactor}` : ''}</Num>
          <Text>{t('products.available')}: <Num>{hit.available === null ? '—' : `${num(hit.available)} ${hit.baseUnit}`}</Num></Text>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button title={t('common.details')} variant="outline" onPress={() => router.push(`/product/${hit.productId}`)} />
            {can('inventory.create') && <Button title={t('mobile.quickAdjust')} variant="secondary" onPress={() => router.push({ pathname: '/adjust', params: { productId: hit.productId, name: hit.name } })} />}
            {can('stock_counts.update') && <Button title={t('mobile.physicalCount')} variant="accent" onPress={() => router.push('/counts')} />}
          </Row>
        </Card>
      )}
    </Screen>
  );
}

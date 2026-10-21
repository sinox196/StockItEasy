import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { Badge, Button, Card, Empty, ErrorView, Loading, Num, Row, Screen, Text } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth, useI18n } from '../src/providers/app';

/** Stock Autopilot recommendations; approving creates a draft purchase order for review. */
export default function Autopilot() {
  const { t, te, num, money, date } = useI18n();
  const { can, org } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['m-autopilot'], queryFn: () => api.autopilot.list('OPEN') });
  const decide = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      const r = await api.autopilot.decide(id, { decision });
      Alert.alert(decision === 'APPROVE' ? t('autopilot.approved', { number: r.purchaseOrderNumber ?? '' }) : t('autopilot.rejected'));
      await qc.invalidateQueries({ queryKey: ['m-autopilot'] });
    } catch (e) {
      Alert.alert(t('common.errorTitle'), te((e as { code?: string }).code));
    }
  };
  if (query.isLoading) return <Loading />;
  if (query.error) return <Screen><ErrorView error={query.error} onRetry={() => query.refetch()} /></Screen>;
  return (
    <Screen>
      <Text muted>{t('autopilot.subtitle')}</Text>
      {!query.data?.items.length && <Empty text={t('autopilot.empty')} />}
      {query.data?.items.map((r) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text weight="700" style={{ flex: 1 }}>{r.product?.name}</Text>
            <Badge label={t(`autopilot.priority${r.priority}`)} tone={r.priority === 'CRITICAL' ? 'danger' : r.priority === 'RECOMMENDED' ? 'warning' : 'neutral'} />
          </Row>
          <Text muted size={13}>{r.warehouse?.name} · {r.supplier?.name ?? t('autopilot.noSupplier')}</Text>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text size={14}>{t('autopilot.suggestedQty')}: <Num>{num(r.suggestedQty)}</Num></Text>
            <Num>{money(r.estimatedCost, org?.currency)}</Num>
          </Row>
          <Text size={13}>{t('autopilot.stockoutDate')}: {r.stockoutDate ? date(r.stockoutDate) : '—'} · {t('autopilot.confidence')}: {t(`autopilot.confidence${r.confidence}`)}</Text>
          {r.reasons.map((x, i) => <Text key={i} muted size={13}>• {t(x.key, x.params)}</Text>)}
          {can('autopilot.approve') && (
            <Row>
              <Button title={t('common.approve')} variant="accent" style={{ flex: 1 }} disabled={!r.supplierId} onPress={() => void decide(r.id, 'APPROVE')} />
              <Button title={t('common.reject')} variant="outline" style={{ flex: 1 }} onPress={() => void decide(r.id, 'REJECT')} />
            </Row>
          )}
        </Card>
      ))}
    </Screen>
  );
}

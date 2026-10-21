import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Card, ErrorView, Kpi, Loading, Num, Row, Screen, Text } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth, useI18n } from '../src/providers/app';

/** Mobile report summary: key figures and the products that matter most. */
export default function Reports() {
  const { t, money, num, pct } = useI18n();
  const { org } = useAuth();
  const summary = useQuery({ queryKey: ['m-summary'], queryFn: () => api.dashboard.summary() });
  const abc = useQuery({ queryKey: ['m-abc'], queryFn: () => api.reports.abc(90) });
  const dormant = useQuery({ queryKey: ['m-dormant'], queryFn: () => api.reports.dormant(60) });
  if (summary.isLoading) return <Loading />;
  if (summary.error) return <Screen><ErrorView error={summary.error} /></Screen>;
  const k = summary.data!.kpis;
  const cur = org?.currency;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Kpi label={t('dashboard.revenue')} value={money(k.revenue, cur)} />
        <Kpi label={t('dashboard.grossMargin')} value={money(k.grossMargin, cur)} tone="success" />
        <Kpi label={t('dashboard.stockValue')} value={money(k.stockValue, cur)} />
        <Kpi label={t('reports.immobilized')} value={money(dormant.data?.immobilized ?? '0', cur)} tone="warning" />
      </View>
      <Card>
        <Text weight="700">{t('reports.abc')} — {t('reports.classA')}</Text>
        {abc.data?.rows.filter((r) => r.class === 'A').slice(0, 10).map((r) => (
          <Row key={r.id} style={{ justifyContent: 'space-between' }}>
            <Text style={{ flex: 1 }} size={14}>{r.name}</Text>
            <Num size={14}>{pct(r.share)}</Num>
          </Row>
        ))}
      </Card>
      <Card>
        <Text weight="700">{t('reports.dormant')}</Text>
        {dormant.data?.rows.slice(0, 10).map((r) => (
          <Row key={r.id} style={{ justifyContent: 'space-between' }}>
            <Text style={{ flex: 1 }} size={14}>{r.name}</Text>
            <Num size={14}>{num(r.onHand)} · {money(r.value, cur)}</Num>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}

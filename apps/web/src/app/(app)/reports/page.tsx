'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Guard } from '@/components/shell/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KpiCard, PageHeader, TabsBar } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { downloadText, toCsv } from '@/lib/utils';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function ReportsScreen() {
  const { t, money, num, date, pct } = useI18n();
  const { can, org } = useAuth();
  const [tab, setTab] = useState('valuation');
  const currency = org?.currency;
  const valuation = useQuery({ queryKey: ['reports', 'valuation'], queryFn: () => api.reports.valuation(), enabled: tab === 'valuation' });
  const abc = useQuery({ queryKey: ['reports', 'abc'], queryFn: () => api.reports.abc(90), enabled: tab === 'abc' });
  const dormant = useQuery({ queryKey: ['reports', 'dormant'], queryFn: () => api.reports.dormant(60), enabled: tab === 'dormant' });
  const sales = useQuery({ queryKey: ['reports', 'sales'], queryFn: () => api.reports.sales({ from: new Date(Date.now() - 30 * 86400_000).toISOString() }), enabled: tab === 'sales' });
  const exportBtn = (rows: Record<string, unknown>[] | undefined, name: string) =>
    can('reports.export') && rows?.length ? <Button variant="outline" size="sm" onClick={() => downloadText(`${name}.csv`, toCsv(rows))}><Download /> {t('common.exportCsv')}</Button> : null;

  return (
    <div>
      <PageHeader title={t('reports.title')} />
      <TabsBar value={tab} onChange={setTab} items={[{ value: 'valuation', label: t('reports.valuation') }, { value: 'abc', label: t('reports.abc') }, { value: 'dormant', label: t('reports.dormant') }, { value: 'sales', label: t('reports.sales') }]} />
      {tab === 'valuation' && (
        <QueryState query={valuation} isEmpty={(d) => d.rows.length === 0}>
          {(d) => (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><KpiCard label={t('dashboard.stockValue')} value={<Num>{money(d.total, currency)}</Num>} />{exportBtn(d.rows, 'valuation')}</div>
              <Card>
                <Table>
                  <THead><tr><Th>{t('products.sku')}</Th><Th>{t('common.product')}</Th><Th>{t('common.category')}</Th><Th className="text-end">{t('products.onHand')}</Th><Th className="text-end">{t('products.averageCost')}</Th><Th className="text-end">{t('movements.value')}</Th></tr></THead>
                  <TBody>{d.rows.map((r) => <Tr key={r.id}><Td><Num className="text-xs">{r.sku}</Num></Td><Td>{r.name}</Td><Td className="text-muted-foreground">{r.category ?? '—'}</Td><Td className="text-end"><Num>{num(r.onHand)}</Num></Td><Td className="text-end"><Num>{money(r.averageCost, currency)}</Num></Td><Td className="text-end font-semibold"><Num>{money(r.value, currency)}</Num></Td></Tr>)}</TBody>
                </Table>
              </Card>
            </>
          )}
        </QueryState>
      )}
      {tab === 'abc' && (
        <QueryState query={abc} isEmpty={(d) => d.rows.length === 0}>
          {(d) => (
            <Card>
              <div className="flex justify-end p-3">{exportBtn(d.rows, 'abc')}</div>
              <Table>
                <THead><tr><Th>{t('common.product')}</Th><Th className="text-end">{t('dashboard.revenue')}</Th><Th className="text-end">{t('reports.share')}</Th><Th className="text-end">%</Th><Th /></tr></THead>
                <TBody>{d.rows.map((r) => <Tr key={r.id}><Td>{r.name} <Num className="text-xs text-muted-foreground">{r.sku}</Num></Td><Td className="text-end"><Num>{money(r.revenue, currency)}</Num></Td><Td className="text-end"><Num>{pct(r.share)}</Num></Td><Td className="text-end text-muted-foreground"><Num>{pct(r.cumulativeShare)}</Num></Td><Td><Badge tone={r.class === 'A' ? 'success' : r.class === 'B' ? 'info' : 'neutral'}>{t(`reports.class${r.class}`)}</Badge></Td></Tr>)}</TBody>
              </Table>
            </Card>
          )}
        </QueryState>
      )}
      {tab === 'dormant' && (
        <QueryState query={dormant} isEmpty={(d) => d.rows.length === 0} empty={<Card><EmptyState /></Card>}>
          {(d) => (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><KpiCard label={t('reports.immobilized')} value={<Num>{money(d.immobilized, currency)}</Num>} tone="warning" />{exportBtn(d.rows, 'dormant')}</div>
              <Card>
                <Table>
                  <THead><tr><Th>{t('common.product')}</Th><Th className="text-end">{t('products.onHand')}</Th><Th className="text-end">{t('movements.value')}</Th><Th>{t('reports.lastSale')}</Th><Th className="text-end">{t('reports.daysWithoutSale')}</Th></tr></THead>
                  <TBody>{d.rows.map((r) => <Tr key={r.id}><Td>{r.name} <Num className="text-xs text-muted-foreground">{r.sku}</Num></Td><Td className="text-end"><Num>{num(r.onHand)}</Num></Td><Td className="text-end"><Num>{money(r.value, currency)}</Num></Td><Td>{date(r.lastSale)}</Td><Td className="text-end"><Num>{r.daysWithoutSale ?? '∞'}</Num></Td></Tr>)}</TBody>
                </Table>
              </Card>
            </>
          )}
        </QueryState>
      )}
      {tab === 'sales' && (
        <QueryState query={sales} isEmpty={(d) => d.rows.length === 0} empty={<Card><EmptyState /></Card>}>
          {(d) => (
            <Card>
              <div className="flex justify-end p-3">{exportBtn(d.rows, 'sales-margins')}</div>
              <Table>
                <THead><tr><Th>{t('common.product')}</Th><Th className="text-end">{t('common.quantity')}</Th><Th className="text-end">{t('dashboard.revenue')}</Th><Th className="text-end">{t('dashboard.cogs')}</Th><Th className="text-end">{t('sales.margin')}</Th><Th className="text-end">%</Th></tr></THead>
                <TBody>{d.rows.map((r) => <Tr key={r.id}><Td>{r.name}</Td><Td className="text-end"><Num>{num(r.quantity)}</Num></Td><Td className="text-end"><Num>{money(r.revenue, currency)}</Num></Td><Td className="text-end"><Num>{money(r.cost, currency)}</Num></Td><Td className="text-end font-semibold"><Num>{money(r.margin, currency)}</Num></Td><Td className="text-end"><Num>{r.marginRate ? pct(r.marginRate) : '—'}</Num></Td></Tr>)}</TBody>
              </Table>
            </Card>
          )}
        </QueryState>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return <Guard permission="reports.read"><ReportsScreen /></Guard>;
}

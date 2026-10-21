'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, ScanBarcode } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Guard } from '@/components/shell/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader, Pagination, SearchInput } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { downloadText, toCsv } from '@/lib/utils';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function SalesScreen() {
  const { t, money, dateTime } = useI18n();
  const { can, org } = useAuth();
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const filters = { search: q || undefined, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined };
  const query = useQuery({ queryKey: ['sales', filters, page], queryFn: () => api.sales.list({ ...filters, page }), placeholderData: keepPreviousData });
  const exportCsv = async () => {
    const all = await api.sales.list({ ...filters, pageSize: 200 });
    downloadText('sales.csv', toCsv(all.items.map((s) => ({ number: s.number, date: s.completedAt, customer: s.customer?.name ?? '', subtotal: s.subtotal, tax: s.taxTotal, total: s.total, cost: s.costTotal, margin: s.margin, paid: s.paidTotal, payment: s.paymentStatus, status: s.status }))));
  };
  return (
    <div>
      <PageHeader
        title={t('sales.title')}
        actions={<>
          {can('sales.export') && <Button variant="outline" onClick={exportCsv}><Download /> {t('common.exportCsv')}</Button>}
          {can('sales.create') && <Button asChild variant="accent"><Link href="/pos"><ScanBarcode /> {t('dashboard.openPos')}</Link></Button>}
        </>}
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('common.search')} />
          <Input type="date" className="w-auto" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="from" />
          <Input type="date" className="w-auto" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="to" />
        </div>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState description={t('sales.empty')} />}>
          {(data) => (
            <>
              <Table>
                <THead><tr><Th>{t('sales.number')}</Th><Th>{t('common.date')}</Th><Th>{t('common.customer')}</Th><Th className="text-end">{t('common.totalTtc')}</Th><Th className="text-end">{t('sales.margin')}</Th><Th>{t('sales.paid')}</Th><Th>{t('common.status')}</Th></tr></THead>
                <TBody>
                  {data.items.map((s) => (
                    <Tr key={s.id}>
                      <Td><Link href={`/sales/${s.id}`} className="font-medium hover:underline"><Num>{s.number}</Num></Link>{s.isDemo && <Badge tone="demo" className="ms-2">{t('app.demoBadge')}</Badge>}</Td>
                      <Td className="whitespace-nowrap text-xs">{dateTime(s.completedAt)}</Td>
                      <Td>{s.customer?.name ?? t('pos.walkInCustomer')}</Td>
                      <Td className="text-end font-semibold"><Num>{money(s.total, org?.currency)}</Num></Td>
                      <Td className="text-end"><Num>{money(s.margin, org?.currency)}</Num></Td>
                      <Td><StatusBadge ns="sales.paymentStatuses" status={s.paymentStatus} /></Td>
                      <Td><StatusBadge ns="sales.statuses" status={s.status} /></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  );
}

export default function SalesPage() {
  return <Guard permission="sales.read"><SalesScreen /></Guard>;
}

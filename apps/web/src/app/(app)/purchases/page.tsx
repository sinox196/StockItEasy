'use client';

import { PO_STATUSES } from '@stockiteasy/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Guard } from '@/components/shell/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { PageHeader, Pagination, SearchInput } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function PurchasesScreen() {
  const { t, money, date } = useI18n();
  const { can, org } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const query = useQuery({ queryKey: ['purchases', q, status, page], queryFn: () => api.purchases.list({ search: q, status: status || undefined, page }), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title={t('purchases.title')} actions={can('purchases.create') && <Button asChild><Link href="/purchases/new"><Plus /> {t('purchases.new')}</Link></Button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('common.search')} />
          <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('common.status')}>
            <option value="">{t('common.status')}: {t('common.all')}</option>
            {PO_STATUSES.map((s) => <option key={s} value={s}>{t(`purchases.statuses.${s}`)}</option>)}
          </Select>
        </div>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState description={t('purchases.empty')} />}>
          {(data) => (
            <>
              <Table>
                <THead><tr><Th>{t('purchases.number')}</Th><Th>{t('common.supplier')}</Th><Th>{t('purchases.orderDate')}</Th><Th>{t('purchases.expectedDate')}</Th><Th className="text-end">{t('common.total')}</Th><Th>{t('common.status')}</Th></tr></THead>
                <TBody>
                  {data.items.map((po) => (
                    <Tr key={po.id}>
                      <Td>
                        <Link href={`/purchases/${po.id}`} className="font-medium hover:underline"><Num>{po.number}</Num></Link>
                        {po.source === 'AUTOPILOT' && <Sparkles className="ms-1 inline size-3.5 text-secondary" aria-label={t('purchases.fromAutopilot')} />}
                        {po.isDemo && <Badge tone="demo" className="ms-2">{t('app.demoBadge')}</Badge>}
                      </Td>
                      <Td>{po.supplier.name}</Td>
                      <Td>{date(po.orderDate)}</Td>
                      <Td>{date(po.expectedDate)}</Td>
                      <Td className="text-end font-semibold"><Num>{money(po.total, org?.currency)}</Num></Td>
                      <Td><StatusBadge ns="purchases.statuses" status={po.status} /></Td>
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

export default function PurchasesPage() {
  return <Guard permission="purchases.read"><PurchasesScreen /></Guard>;
}

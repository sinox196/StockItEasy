'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Guard } from '@/components/shell/require-auth';
import { Card } from '@/components/ui/card';
import { PageHeader, Pagination, SearchInput } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { useI18n } from '@/providers/i18n';

function AuditScreen() {
  const { t, dateTime } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const query = useQuery({ queryKey: ['audit', q, page], queryFn: () => api.audit.list({ search: q, page, pageSize: 40 }), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title={t('audit.title')} />
      <Card>
        <div className="border-b border-border p-3"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="inventory.adjust, sale.create…" /></div>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState description={t('audit.empty')} />}>
          {(data) => (
            <>
              <Table>
                <THead><tr><Th>{t('common.date')}</Th><Th>{t('common.user')}</Th><Th>{t('audit.action')}</Th><Th>{t('audit.entity')}</Th><Th>{t('audit.changes')}</Th><Th>{t('audit.ip')}</Th></tr></THead>
                <TBody>
                  {data.items.map((a) => (
                    <Tr key={a.id}>
                      <Td className="whitespace-nowrap text-xs">{dateTime(a.createdAt)}</Td>
                      <Td className="text-sm">{a.user?.fullName ?? '—'}</Td>
                      <Td><Num className="text-xs font-semibold">{a.action}</Num></Td>
                      <Td className="text-xs text-muted-foreground">{a.entityType}</Td>
                      <Td className="max-w-md"><code className="line-clamp-2 break-all text-[11px] text-muted-foreground" dir="ltr">{a.data ? JSON.stringify(a.data) : ''}</code></Td>
                      <Td><Num className="text-xs">{a.ip ?? '—'}</Num></Td>
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

export default function AuditPage() {
  return <Guard permission="audit.read"><AuditScreen /></Guard>;
}

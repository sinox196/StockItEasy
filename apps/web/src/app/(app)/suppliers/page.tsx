'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Guard } from '@/components/shell/require-auth';
import { SupplierDialog } from '@/components/trade/supplier-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, Pagination, SearchInput } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function SuppliersScreen() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const q = useDebounced(search);
  const query = useQuery({ queryKey: ['suppliers', q, page], queryFn: () => api.suppliers.list({ search: q, page }), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title={t('suppliers.title')} actions={can('suppliers.create') && <Button onClick={() => setOpen(true)}><Plus /> {t('suppliers.new')}</Button>} />
      <Card>
        <div className="border-b border-border p-3"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('common.search')} /></div>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState description={t('suppliers.empty')} />}>
          {(data) => (
            <>
              <Table>
                <THead><tr><Th>{t('common.name')}</Th><Th>{t('suppliers.contactName')}</Th><Th>{t('suppliers.phone')}</Th><Th>{t('warehouses.city')}</Th><Th className="text-end">{t('suppliers.leadTime')}</Th><Th className="text-end">{t('common.products')}</Th></tr></THead>
                <TBody>
                  {data.items.map((s) => (
                    <Tr key={s.id}>
                      <Td><Link href={`/suppliers/${s.id}`} className="font-medium hover:underline">{s.name}</Link>{s.isDemo && <Badge tone="demo" className="ms-2">{t('app.demoBadge')}</Badge>}</Td>
                      <Td>{s.contactName ?? '—'}</Td>
                      <Td><Num>{s.phone ?? '—'}</Num></Td>
                      <Td>{s.city ?? '—'}</Td>
                      <Td className="text-end"><Num>{t('common.days', { count: s.leadTimeDays })}</Num></Td>
                      <Td className="text-end"><Num>{s._count?.products ?? 0}</Num></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
      {open && <SupplierDialog open onOpenChange={setOpen} />}
    </div>
  );
}

export default function SuppliersPage() {
  return <Guard permission="suppliers.read"><SuppliersScreen /></Guard>;
}

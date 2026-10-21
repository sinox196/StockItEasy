'use client';

import { MOVEMENT_TYPES } from '@stockiteasy/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AdjustDialog } from '@/components/products/adjust-dialog';
import { Guard } from '@/components/shell/require-auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader, Pagination, SearchInput } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { downloadText, reasonLabel, toCsv } from '@/lib/utils';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function MovementsScreen() {
  const { t, num, money, dateTime } = useI18n();
  const { can, org } = useAuth();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [adjust, setAdjust] = useState(false);
  const q = useDebounced(search);
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: api.warehouses.list });
  const filters = { search: q || undefined, type: type || undefined, warehouseId: warehouseId || undefined, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined };
  const query = useQuery({ queryKey: ['movements', { ...filters, page }], queryFn: () => api.inventory.movements({ ...filters, page, pageSize: 30 }), placeholderData: keepPreviousData });

  const exportCsv = async () => {
    const all = await api.inventory.movements({ ...filters, page: 1, pageSize: 200 });
    downloadText('movements.csv', toCsv(all.items.map((m) => ({ date: m.occurredAt, type: m.type, sku: m.product?.sku, product: m.product?.name, warehouse: m.warehouse?.name, quantity: m.quantity, unitCost: m.unitCost, totalCost: m.totalCost, balanceAfter: m.balanceAfter, reason: m.reason ?? '', note: m.note ?? '', user: m.user?.fullName ?? '' }))));
  };

  return (
    <div>
      <PageHeader
        title={t('movements.title')}
        actions={
          <>
            {can('inventory.export') && <Button variant="outline" onClick={exportCsv}><Download /> {t('common.exportCsv')}</Button>}
            {can('inventory.create') && <Button onClick={() => setAdjust(true)}><SlidersHorizontal /> {t('movements.newAdjustment')}</Button>}
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
          <Select className="w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label={t('movements.type')}>
            <option value="">{t('movements.type')}: {t('common.all')}</option>
            {MOVEMENT_TYPES.map((m) => <option key={m} value={m}>{t(`movements.types.${m}`)}</option>)}
          </Select>
          <Select className="w-auto" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPage(1); }} aria-label={t('common.warehouse')}>
            <option value="">{t('common.warehouse')}: {t('common.all')}</option>
            {warehouses.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Input type="date" className="w-auto" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="from" />
          <Input type="date" className="w-auto" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="to" />
        </div>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState description={t('movements.empty')} />}>
          {(data) => (
            <>
              <Table>
                <THead><tr><Th>{t('common.date')}</Th><Th>{t('common.product')}</Th><Th>{t('movements.type')}</Th><Th>{t('common.warehouse')}</Th><Th className="text-end">{t('common.quantity')}</Th><Th className="text-end">{t('movements.value')}</Th><Th className="text-end">{t('movements.balanceAfter')}</Th><Th>{t('common.reason')}</Th><Th>{t('common.user')}</Th></tr></THead>
                <TBody>
                  {data.items.map((m) => (
                    <Tr key={m.id}>
                      <Td className="whitespace-nowrap text-xs">{dateTime(m.occurredAt)}</Td>
                      <Td><Link href={`/products/${m.productId}`} className="font-medium hover:underline">{m.product?.name}</Link><div><Num className="text-xs text-muted-foreground">{m.product?.sku}</Num></div></Td>
                      <Td>{t(`movements.types.${m.type}`)}</Td>
                      <Td className="text-muted-foreground">{m.warehouse?.name}</Td>
                      <Td className={`text-end font-semibold ${Number(m.quantity) >= 0 ? 'text-success' : 'text-danger'}`}><Num>{Number(m.quantity) > 0 ? '+' : ''}{num(m.quantity)}</Num></Td>
                      <Td className="text-end"><Num>{money(m.totalCost, org?.currency)}</Num></Td>
                      <Td className="text-end"><Num>{num(m.balanceAfter)}</Num></Td>
                      <Td className="max-w-48 truncate text-xs text-muted-foreground">{reasonLabel(t, m.reason) ?? m.referenceType ?? '—'}{m.note ? ` · ${m.note}` : ''}</Td>
                      <Td className="text-xs text-muted-foreground">{m.user?.fullName ?? '—'}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <AdjustDialog open={adjust} onOpenChange={setAdjust} />
    </div>
  );
}

export default function MovementsPage() {
  return <Guard permission="inventory.read"><MovementsScreen /></Guard>;
}

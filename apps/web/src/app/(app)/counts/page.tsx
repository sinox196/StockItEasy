'use client';

import { COUNT_SCOPES } from '@stockiteasy/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Guard } from '@/components/shell/require-auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import { PageHeader, Pagination } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function CountsScreen() {
  const { t, date } = useI18n();
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ warehouseId: '', scope: 'PARTIAL', categoryId: '', note: '' });
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['counts', page], queryFn: () => api.counts.list({ page }) });
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: api.warehouses.list });
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories.list });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const c = await api.counts.create({ warehouseId: f.warehouseId || warehouses.data?.[0]?.id, scope: f.scope, categoryId: f.categoryId || undefined, note: f.note || undefined });
      await qc.invalidateQueries({ queryKey: ['counts'] });
      router.push(`/counts/${c.id}`);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('counts.title')} actions={can('stock_counts.create') && <Button onClick={() => setOpen(true)}><Plus /> {t('counts.new')}</Button>} />
      <Card>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState description={t('counts.empty')} />}>
          {(data) => (
            <>
              <Table>
                <THead><tr><Th>{t('common.reference')}</Th><Th>{t('common.warehouse')}</Th><Th>{t('counts.scope')}</Th><Th>{t('common.date')}</Th><Th>{t('common.lines')}</Th><Th>{t('common.status')}</Th></tr></THead>
                <TBody>
                  {data.items.map((c) => (
                    <Tr key={c.id}>
                      <Td><Link href={`/counts/${c.id}`} className="font-medium hover:underline"><Num>{c.number}</Num></Link></Td>
                      <Td>{c.warehouseName}</Td>
                      <Td>{t(`counts.scopes.${c.scope}`)}</Td>
                      <Td>{date(c.createdAt)}</Td>
                      <Td>{t('counts.progress', { counted: c.countedLines ?? 0, total: c.totalLines ?? 0 })}</Td>
                      <Td><StatusBadge ns="counts.statuses" status={c.status} /></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <Dialog open={open} onOpenChange={setOpen} title={t('counts.new')} footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button type="submit" form="count-form" loading={busy}>{t('common.create')}</Button></>}>
        <form id="count-form" onSubmit={create} className="space-y-4">
          <Field label={t('common.warehouse')} htmlFor="cw"><Select id="cw" value={f.warehouseId} onChange={(e) => setF({ ...f, warehouseId: e.target.value })}>{warehouses.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
          <Field label={t('counts.scope')} htmlFor="cs"><Select id="cs" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>{COUNT_SCOPES.map((s) => <option key={s} value={s}>{t(`counts.scopes.${s}`)}</option>)}</Select></Field>
          {f.scope === 'PARTIAL' && (
            <Field label={t('common.category')} htmlFor="cc" hint={t('counts.scanToCount')}>
              <Select id="cc" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">—</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Field>
          )}
          <Field label={t('common.note')} htmlFor="cn"><Textarea id="cn" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </form>
      </Dialog>
    </div>
  );
}

export default function CountsPage() {
  return <Guard permission="stock_counts.read"><CountsScreen /></Guard>;
}

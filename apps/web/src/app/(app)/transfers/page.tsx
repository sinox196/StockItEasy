'use client';

import type { ProductListItem } from '@stockiteasy/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ProductPicker } from '@/components/products/product-picker';
import { Guard } from '@/components/shell/require-auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader, Pagination } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function NewTransfer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: api.warehouses.list, enabled: open });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<{ product: ProductListItem; quantity: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const tr = await api.transfers.create({ fromWarehouseId: from, toWarehouseId: to, note: note || undefined, lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })) });
      await qc.invalidateQueries({ queryKey: ['transfers'] });
      onOpenChange(false);
      router.push(`/transfers/${tr.id}`);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('transfers.new')} size="lg" footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button type="submit" form="tr-form" loading={busy} disabled={!from || !to || from === to || !lines.length}>{t('common.create')}</Button></>}>
      <form id="tr-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('transfers.from')} htmlFor="tf"><Select id="tf" required value={from} onChange={(e) => setFrom(e.target.value)}><option value="">—</option>{warehouses.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
          <Field label={t('transfers.to')} htmlFor="tt" error={from && from === to ? t('validation.sameWarehouse') : undefined}><Select id="tt" required value={to} onChange={(e) => setTo(e.target.value)}><option value="">—</option>{warehouses.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
        </div>
        <ProductPicker warehouseId={from || undefined} onPick={(p) => setLines((ls) => (ls.some((l) => l.product.id === p.id) ? ls : [...ls, { product: p, quantity: '1' }]))} />
        <ul className="space-y-2">
          {lines.map((l, i) => (
            <li key={l.product.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <span className="flex-1 text-sm">{l.product.name} <Num className="text-xs text-muted-foreground">{l.product.sku}</Num></span>
              <Input className="w-24" dir="ltr" inputMode="decimal" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} aria-label={t('common.quantity')} />
              <Button type="button" size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={t('common.removeLine')}><Trash2 /></Button>
            </li>
          ))}
        </ul>
        <Field label={t('common.note')} htmlFor="tn"><Textarea id="tn" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </form>
    </Dialog>
  );
}

function TransfersScreen() {
  const { t, date } = useI18n();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ['transfers', page, status], queryFn: () => api.transfers.list({ page, status: status || undefined }) });
  return (
    <div>
      <PageHeader title={t('transfers.title')} actions={can('transfers.create') && <Button onClick={() => setOpen(true)}><Plus /> {t('transfers.new')}</Button>} />
      <Card>
        <div className="border-b border-border p-3">
          <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('common.status')}>
            <option value="">{t('common.status')}: {t('common.all')}</option>
            {['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'].map((s) => <option key={s} value={s}>{t(`transfers.statuses.${s}`)}</option>)}
          </Select>
        </div>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState description={t('transfers.empty')} />}>
          {(data) => (
            <>
              <Table>
                <THead><tr><Th>{t('common.reference')}</Th><Th>{t('transfers.from')}</Th><Th>{t('transfers.to')}</Th><Th className="text-end">{t('common.lines')}</Th><Th>{t('common.date')}</Th><Th>{t('common.status')}</Th></tr></THead>
                <TBody>
                  {data.items.map((tr) => (
                    <Tr key={tr.id}>
                      <Td><Link href={`/transfers/${tr.id}`} className="font-medium hover:underline"><Num>{tr.number}</Num></Link></Td>
                      <Td>{tr.from?.name}</Td><Td>{tr.to?.name}</Td>
                      <Td className="text-end"><Num>{tr._count?.lines}</Num></Td>
                      <Td>{date(tr.createdAt)}</Td>
                      <Td><StatusBadge ns="transfers.statuses" status={tr.status} /></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <NewTransfer open={open} onOpenChange={setOpen} />
    </div>
  );
}

export default function TransfersPage() {
  return <Guard permission="transfers.read"><TransfersScreen /></Guard>;
}

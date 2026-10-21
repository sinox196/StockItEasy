'use client';

import type { PurchaseOrder } from '@stockiteasy/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, PackageCheck, Sparkles } from 'lucide-react';
import { FormEvent, use, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { Num, QueryState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function ReceiveDialog({ po, open, onOpenChange }: { po: PurchaseOrder; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, num } = useI18n();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [rows, setRows] = useState<Record<string, { quantity: string; unitCost: string; lotNumber: string; expiryDate: string; discrepancyReason: string }>>(() =>
    Object.fromEntries((po.lines ?? []).map((l) => [l.id, { quantity: l.remaining, unitCost: l.unitPrice, lotNumber: '', expiryDate: '', discrepancyReason: '' }])),
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const lines = Object.entries(rows)
        .filter(([, r]) => Number(r.quantity) > 0)
        .map(([lineId, r]) => ({ lineId, quantity: r.quantity, unitCost: r.unitCost || undefined, lotNumber: r.lotNumber || undefined, expiryDate: r.expiryDate || undefined, discrepancyReason: r.discrepancyReason || undefined }));
      await api.purchases.receive(po.id, { lines, note: note || undefined });
      toast.success(t('purchases.goodsReceived'));
      await Promise.all([qc.invalidateQueries({ queryKey: ['purchases'] }), qc.invalidateQueries({ queryKey: ['products'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
      onOpenChange(false);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="xl" title={t('purchases.receiveTitle')} description={po.number} footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button type="submit" form="recv-form" variant="accent" loading={busy}>{t('common.validate')}</Button></>}>
      <form id="recv-form" onSubmit={submit} className="space-y-4">
        <Table>
          <THead><tr><Th>{t('common.product')}</Th><Th className="text-end">{t('purchases.remaining')}</Th><Th>{t('purchases.receiveNow')}</Th><Th>{t('movements.unitCost')}</Th><Th>{t('products.lotNumber')}</Th><Th>{t('products.expiryDate')}</Th></tr></THead>
          <TBody>
            {po.lines?.filter((l) => Number(l.remaining) > 0).map((l) => {
              const r = rows[l.id];
              const set = (patch: Partial<typeof r>) => setRows({ ...rows, [l.id]: { ...r, ...patch } });
              const lot = l.product?.tracking === 'LOT';
              return (
                <Tr key={l.id}>
                  <Td>{l.product?.name}</Td>
                  <Td className="text-end"><Num>{num(l.remaining)}</Num></Td>
                  <Td><Input className="w-24" dir="ltr" inputMode="decimal" value={r.quantity} onChange={(e) => set({ quantity: e.target.value })} aria-label={t('purchases.receiveNow')} /></Td>
                  <Td><Input className="w-28" dir="ltr" inputMode="decimal" value={r.unitCost} onChange={(e) => set({ unitCost: e.target.value })} aria-label={t('movements.unitCost')} /></Td>
                  <Td>{lot ? <Input className="w-28" dir="ltr" required value={r.lotNumber} onChange={(e) => set({ lotNumber: e.target.value })} aria-label={t('products.lotNumber')} /> : '—'}</Td>
                  <Td>{l.product?.hasExpiry ? <Input type="date" required value={r.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} aria-label={t('products.expiryDate')} /> : '—'}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
        <Field label={t('common.note')} htmlFor="rn"><Textarea id="rn" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </form>
    </Dialog>
  );
}

export default function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, money, num, date, dateTime } = useI18n();
  const { can, org } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const query = useQuery({ queryKey: ['purchases', id], queryFn: () => api.purchases.get(id) });
  const [receive, setReceive] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.success(t('common.saved'));
      await qc.invalidateQueries({ queryKey: ['purchases'] });
    } catch (e) {
      onError(e);
    }
  };

  return (
    <QueryState query={query}>
      {(po) => {
        const currency = org?.currency;
        const message = [
          t('purchases.supplierMessage', { supplier: po.supplier.name, number: po.number }),
          ...(po.lines ?? []).map((l) => `- ${l.product?.name} (${l.product?.sku}) × ${num(l.quantity)}`),
          po.expectedDate ? `${t('purchases.expectedDate')}: ${date(po.expectedDate)}` : '',
          org?.name ?? '',
        ].filter(Boolean).join('\n');
        return (
          <div>
            <PageHeader
              title={<Num>{po.number}</Num>}
              badge={<><StatusBadge ns="purchases.statuses" status={po.status} />{po.source === 'AUTOPILOT' && <span className="inline-flex items-center gap-1 text-xs text-secondary"><Sparkles className="size-3.5" />{t('purchases.fromAutopilot')}</span>}</>}
              description={`${po.supplier.name} · ${po.warehouse?.name ?? ''}`}
              actions={
                <>
                  <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(message); toast.success(t('common.copied')); }}><Copy /> {t('purchases.copyMessage')}</Button>
                  {po.status === 'DRAFT' && can('purchases.create') && !can('purchases.approve') && <ConfirmButton onConfirm={() => act(() => api.purchases.submit(id))}>{t('purchases.submit')}</ConfirmButton>}
                  {['DRAFT', 'PENDING_APPROVAL'].includes(po.status) && can('purchases.approve') && <ConfirmButton onConfirm={() => act(() => api.purchases.approve(id))}>{t('purchases.approve')}</ConfirmButton>}
                  {po.status === 'APPROVED' && can('purchases.approve') && <ConfirmButton variant="secondary" onConfirm={() => act(() => api.purchases.send(id))}>{t('purchases.markSent')}</ConfirmButton>}
                  {['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status) && can('purchases.update') && <Button variant="accent" onClick={() => setReceive(true)}><PackageCheck /> {t('purchases.receive')}</Button>}
                  {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(po.status) && can('purchases.approve') && <ConfirmButton variant="danger" onConfirm={() => act(() => api.purchases.cancel(id))}>{t('common.cancel')}</ConfirmButton>}
                </>
              }
            />
            <div className="grid gap-5 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <Table>
                  <THead><tr><Th>{t('common.product')}</Th><Th className="text-end">{t('purchases.ordered')}</Th><Th className="text-end">{t('purchases.received')}</Th><Th className="text-end">{t('suppliers.unitPrice')}</Th><Th className="text-end">{t('common.total')}</Th></tr></THead>
                  <TBody>
                    {po.lines?.map((l) => (
                      <Tr key={l.id}>
                        <Td>{l.product?.name} <Num className="text-xs text-muted-foreground">{l.product?.sku}</Num></Td>
                        <Td className="text-end"><Num>{num(l.quantity)}</Num></Td>
                        <Td className={`text-end ${Number(l.quantityReceived) >= Number(l.quantity) ? 'text-success' : Number(l.quantityReceived) > 0 ? 'text-amber-600' : ''}`}><Num>{num(l.quantityReceived)}</Num></Td>
                        <Td className="text-end"><Num>{money(l.unitPrice, currency)}</Num></Td>
                        <Td className="text-end"><Num>{money(l.lineTotal, currency)}</Num></Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </Card>
              <Card>
                <CardBody className="space-y-2 text-sm">
                  <p className="flex justify-between"><span className="text-muted-foreground">{t('purchases.orderDate')}</span>{date(po.orderDate)}</p>
                  <p className="flex justify-between"><span className="text-muted-foreground">{t('purchases.expectedDate')}</span>{date(po.expectedDate)}</p>
                  <p className="flex justify-between border-t border-border pt-2"><span>{t('common.subtotal')}</span><Num>{money(po.subtotal, currency)}</Num></p>
                  <p className="flex justify-between"><span>{t('common.tax')}</span><Num>{money(po.taxTotal, currency)}</Num></p>
                  <p className="flex justify-between text-base font-bold"><span>{t('common.totalTtc')}</span><Num>{money(po.total, currency)}</Num></p>
                  {po.notes && <p className="whitespace-pre-wrap rounded-md bg-muted p-2">{po.notes}</p>}
                </CardBody>
              </Card>
            </div>
            <Card className="mt-5">
              <CardHeader title={t('purchases.receipts')} />
              {!po.receipts?.length ? <p className="p-5 text-sm text-muted-foreground">{t('common.none')}</p> : (
                <Table>
                  <THead><tr><Th>{t('common.reference')}</Th><Th>{t('common.date')}</Th><Th className="text-end">{t('common.lines')}</Th><Th>{t('common.status')}</Th><Th /></tr></THead>
                  <TBody>
                    {po.receipts.map((r) => (
                      <Tr key={r.id}>
                        <Td><Num>{r.number}</Num></Td>
                        <Td>{dateTime(r.receivedAt)}</Td>
                        <Td className="text-end"><Num>{r.lines.length}</Num></Td>
                        <Td><StatusBadge ns="purchases.statuses" status={r.status === 'POSTED' ? 'RECEIVED' : 'CANCELLED'} /></Td>
                        <Td className="text-end">{r.status === 'POSTED' && can('purchases.approve') && <ConfirmButton size="sm" variant="outline" description={t('purchases.cancelReceiptConfirm')} onConfirm={() => act(() => api.purchases.cancelReceipt(r.id))}>{t('purchases.cancelReceipt')}</ConfirmButton>}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
            {receive && <ReceiveDialog po={po} open onOpenChange={setReceive} />}
          </div>
        );
      }}
    </QueryState>
  );
}

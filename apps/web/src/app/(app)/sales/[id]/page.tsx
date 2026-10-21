'use client';

import type { Sale } from '@stockiteasy/api-client';
import { PAYMENT_METHODS } from '@stockiteasy/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Undo2, Wallet } from 'lucide-react';
import { FormEvent, use, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { Num, QueryState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function ReturnDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { t, num } = useI18n();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const lines = Object.entries(qty).filter(([, q]) => Number(q) > 0).map(([lineId, quantity]) => ({ lineId, quantity }));
      await api.sales.return(sale.id, { reason, restock, lines, refundMethod });
      toast.success(t('common.saved'));
      await qc.invalidateQueries({ queryKey: ['sales'] });
      onClose();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('sales.returnTitle')} size="lg" footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="ret-form" loading={busy} disabled={reason.length < 2}>{t('common.validate')}</Button></>}>
      <form id="ret-form" onSubmit={submit} className="space-y-4">
        <Table>
          <THead><tr><Th>{t('common.product')}</Th><Th className="text-end">{t('common.quantity')}</Th><Th className="text-end">{t('sales.returned')}</Th><Th>{t('sales.return')}</Th></tr></THead>
          <TBody>
            {sale.lines?.map((l) => (
              <Tr key={l.id}>
                <Td>{l.product?.name}</Td>
                <Td className="text-end"><Num>{num(l.quantity)}</Num></Td>
                <Td className="text-end"><Num>{num(l.returnedQty)}</Num></Td>
                <Td><Input className="w-24" dir="ltr" inputMode="decimal" value={qty[l.id] ?? ''} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} disabled={Number(l.returnedQty) >= Number(l.quantity)} aria-label={t('sales.return')} /></Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <Field label={t('common.reason')} htmlFor="rr" required><Input id="rr" required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div>
          <Checkbox label={t('sales.restock')} checked={restock} onChange={(e) => setRestock(e.target.checked)} />
          <p className="ms-6 text-xs text-muted-foreground">{t('sales.restockHint')}</p>
        </div>
        <Field label={t('settings.paymentMethods')} htmlFor="rm"><Select id="rm" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>{PAYMENT_METHODS.filter((m) => m !== 'CREDIT').map((m) => <option key={m} value={m}>{t(`settings.paymentMethodsList.${m}`)}</option>)}</Select></Field>
      </form>
    </Dialog>
  );
}

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, money, num, pct, dateTime } = useI18n();
  const { can, org } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const query = useQuery({ queryKey: ['sales', id], queryFn: () => api.sales.get(id) });
  const [ret, setRet] = useState(false);
  const [pay, setPay] = useState<{ method: string; amount: string } | null>(null);
  const currency = org?.currency;
  return (
    <QueryState query={query}>
      {(s) => (
        <div>
          <PageHeader
            title={<Num>{s.number}</Num>}
            badge={<><StatusBadge ns="sales.statuses" status={s.status} /><StatusBadge ns="sales.paymentStatuses" status={s.paymentStatus} /></>}
            description={`${dateTime(s.completedAt)} · ${s.customer?.name ?? t('pos.walkInCustomer')} · ${t(`sales.channels.${s.channel}`)}`}
            actions={
              <>
                <Button variant="outline" onClick={() => window.print()}><Printer /> {t('common.print')}</Button>
                {s.due && Number(s.due) > 0 && can('sales.create') && s.status !== 'CANCELLED' && <Button variant="accent" onClick={() => setPay({ method: 'CASH', amount: s.due! })}><Wallet /> {t('sales.addPayment')}</Button>}
                {['COMPLETED', 'PARTIALLY_RETURNED'].includes(s.status) && can('sales.update') && <Button variant="outline" onClick={() => setRet(true)}><Undo2 /> {t('sales.return')}</Button>}
                {s.status === 'COMPLETED' && can('sales.approve') && (
                  <ConfirmButton variant="danger" onConfirm={async () => { try { await api.sales.cancel(id); await qc.invalidateQueries({ queryKey: ['sales'] }); } catch (e) { onError(e); } }}>{t('sales.cancelSale')}</ConfirmButton>
                )}
              </>
            }
          />
          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <Table>
                <THead><tr><Th>{t('common.product')}</Th><Th className="text-end">{t('common.quantity')}</Th><Th className="text-end">{t('common.price')}</Th><Th className="text-end">{t('common.discount')}</Th><Th className="text-end">{t('common.totalTtc')}</Th><Th className="text-end">{t('sales.margin')}</Th></tr></THead>
                <TBody>
                  {s.lines?.map((l) => (
                    <Tr key={l.id}>
                      <Td>{l.product?.name} {Number(l.returnedQty) > 0 && <span className="text-xs text-amber-600">({t('sales.returned')}: <Num>{num(l.returnedQty)}</Num>)</span>}</Td>
                      <Td className="text-end"><Num>{num(l.quantity)}</Num></Td>
                      <Td className="text-end"><Num>{money(l.unitPrice, currency)}</Num></Td>
                      <Td className="text-end"><Num>{Number(l.discountRate) ? `${num(l.discountRate)} %` : '—'}</Num></Td>
                      <Td className="text-end"><Num>{money(l.lineTotal, currency)}</Num></Td>
                      <Td className="text-end text-muted-foreground"><Num>{money(l.margin, currency)}</Num></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardBody className="space-y-1.5 text-sm">
                  <p className="flex justify-between"><span>{t('common.subtotal')}</span><Num>{money(s.subtotal, currency)}</Num></p>
                  <p className="flex justify-between"><span>{t('common.tax')}</span><Num>{money(s.taxTotal, currency)}</Num></p>
                  <p className="flex justify-between text-base font-bold"><span>{t('common.totalTtc')}</span><Num>{money(s.total, currency)}</Num></p>
                  <p className="flex justify-between text-muted-foreground"><span>{t('dashboard.cogs')}</span><Num>{money(s.costTotal, currency)}</Num></p>
                  <p className="flex justify-between text-muted-foreground"><span>{t('sales.margin')}</span><Num>{money(s.margin, currency)} {s.marginRate ? `(${pct(s.marginRate)})` : ''}</Num></p>
                  <p className="flex justify-between border-t border-border pt-2"><span>{t('sales.paid')}</span><Num>{money(s.paidTotal, currency)}</Num></p>
                  {s.due && Number(s.due) > 0 && <p className="flex justify-between font-semibold text-danger"><span>{t('sales.due')}</span><Num>{money(s.due, currency)}</Num></p>}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title={t('settings.paymentMethods')} />
                <CardBody className="space-y-1 text-sm">
                  {s.payments?.length ? s.payments.map((p) => (
                    <p key={p.id} className="flex justify-between"><span>{t(`settings.paymentMethodsList.${p.method}`)} <span className="text-xs text-muted-foreground">{dateTime(p.paidAt)}</span></span><Num className={p.isRefund ? 'text-danger' : ''}>{money(p.amount, currency)}</Num></p>
                  )) : <p className="text-muted-foreground">{t('common.none')}</p>}
                </CardBody>
              </Card>
            </div>
          </div>
          {ret && <ReturnDialog sale={s} onClose={() => setRet(false)} />}
          <Dialog
            open={!!pay}
            onOpenChange={(o) => !o && setPay(null)}
            size="sm"
            title={t('sales.addPayment')}
            footer={<Button onClick={async () => { try { await api.sales.pay(id, pay!); await qc.invalidateQueries({ queryKey: ['sales'] }); setPay(null); } catch (e) { onError(e); } }}>{t('common.validate')}</Button>}
          >
            {pay && (
              <div className="space-y-3">
                <Field label={t('settings.paymentMethods')} htmlFor="pm"><Select id="pm" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{PAYMENT_METHODS.filter((m) => m !== 'CREDIT').map((m) => <option key={m} value={m}>{t(`settings.paymentMethodsList.${m}`)}</option>)}</Select></Field>
                <Field label={t('common.total')} htmlFor="pa"><Input id="pa" dir="ltr" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
              </div>
            )}
          </Dialog>
        </div>
      )}
    </QueryState>
  );
}

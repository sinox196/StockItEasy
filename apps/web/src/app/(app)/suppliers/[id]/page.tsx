'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, use, useState } from 'react';
import { ProductPicker } from '@/components/products/product-picker';
import { SupplierDialog } from '@/components/trade/supplier-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input } from '@/components/ui/input';
import { KpiCard, PageHeader } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, money, num, date } = useI18n();
  const { can, org } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const query = useQuery({ queryKey: ['suppliers', id], queryFn: () => api.suppliers.get(id) });
  const [edit, setEdit] = useState(false);
  const [link, setLink] = useState<{ productId: string; name: string; unitPrice: string; supplierSku: string; minOrderQty: string; packSize: string; leadTimeDays: string; isPreferred: boolean } | null>(null);
  const currency = org?.currency;

  const saveLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!link) return;
    try {
      await api.suppliers.upsertProduct(id, {
        productId: link.productId,
        unitPrice: link.unitPrice,
        supplierSku: link.supplierSku || null,
        minOrderQty: link.minOrderQty || null,
        packSize: link.packSize || null,
        leadTimeDays: link.leadTimeDays ? Number(link.leadTimeDays) : null,
        isPreferred: link.isPreferred,
      });
      await qc.invalidateQueries({ queryKey: ['suppliers', id] });
      setLink(null);
    } catch (err) {
      onError(err);
    }
  };

  return (
    <QueryState query={query}>
      {(s) => {
        const perf = s.performance;
        const pname = new Map(s.products.map((p) => [p.productId, p.product.name]));
        return (
          <div>
            <PageHeader
              title={s.name}
              badge={s.isDemo && <Badge tone="demo">{t('app.demoBadge')}</Badge>}
              description={[s.contactName, s.city].filter(Boolean).join(' · ')}
              actions={
                <>
                  {can('purchases.create') && <Button asChild variant="secondary"><Link href={`/purchases/new?supplierId=${s.id}`}><Plus /> {t('purchases.new')}</Link></Button>}
                  {can('suppliers.update') && <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> {t('common.edit')}</Button>}
                </>
              }
            />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <KpiCard label={t('suppliers.score')} value={perf.score === null ? '—' : <Num>{perf.score}/100</Num>} sub={!perf.sufficientData ? t('suppliers.scoreInsufficient') : `${perf.completedOrders} ${t('suppliers.ordersCount').toLowerCase()}`} />
              <KpiCard label={t('suppliers.onTimeRate')} value={<Num>{perf.onTimeRate === null ? '—' : `${perf.onTimeRate} %`}</Num>} />
              <KpiCard label={t('suppliers.fillRate')} value={<Num>{perf.fillRate === null ? '—' : `${perf.fillRate} %`}</Num>} />
              <KpiCard label={t('suppliers.avgLeadTime')} value={<Num>{perf.avgLeadTimeDays === null ? '—' : t('common.days', { count: perf.avgLeadTimeDays })}</Num>} sub={`${t('suppliers.leadTime')}: ${t('common.days', { count: s.leadTimeDays })}`} />
              <KpiCard label={t('suppliers.paymentTerms')} value={<Num>{t('common.days', { count: s.paymentTermsDays })}</Num>} />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader title={t('suppliers.catalog')} />
                {can('suppliers.update') && (
                  <div className="border-b border-border p-3">
                    <ProductPicker onPick={(p) => setLink({ productId: p.id, name: p.name, unitPrice: p.purchasePrice, supplierSku: '', minOrderQty: '', packSize: '', leadTimeDays: '', isPreferred: false })} placeholder={t('suppliers.addProduct')} />
                  </div>
                )}
                {s.products.length === 0 ? <EmptyState /> : (
                  <Table>
                    <THead><tr><Th>{t('common.product')}</Th><Th>{t('suppliers.supplierSku')}</Th><Th className="text-end">{t('suppliers.unitPrice')}</Th><Th className="text-end">{t('suppliers.moq')}</Th><Th className="text-end">{t('suppliers.packSize')}</Th><Th /></tr></THead>
                    <TBody>
                      {s.products.map((sp) => (
                        <Tr key={sp.id}>
                          <Td><Link href={`/products/${sp.productId}`} className="hover:underline">{sp.product.name}</Link> {sp.isPreferred && <Badge tone="info" className="ms-1">{t('suppliers.preferred')}</Badge>}</Td>
                          <Td><Num>{sp.supplierSku ?? '—'}</Num></Td>
                          <Td className="text-end"><Num>{money(sp.unitPrice, currency)}</Num></Td>
                          <Td className="text-end"><Num>{sp.minOrderQty ? num(sp.minOrderQty) : '—'}</Num></Td>
                          <Td className="text-end"><Num>{sp.packSize ? num(sp.packSize) : '—'}</Num></Td>
                          <Td className="text-end">
                            {can('suppliers.update') && (
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => setLink({ productId: sp.productId, name: sp.product.name, unitPrice: sp.unitPrice, supplierSku: sp.supplierSku ?? '', minOrderQty: sp.minOrderQty ?? '', packSize: sp.packSize ?? '', leadTimeDays: sp.leadTimeDays?.toString() ?? '', isPreferred: sp.isPreferred })}><Pencil /></Button>
                                <Button size="icon" variant="ghost" aria-label={t('common.delete')} onClick={async () => { try { await api.suppliers.removeProduct(id, sp.productId); await qc.invalidateQueries({ queryKey: ['suppliers', id] }); } catch (e) { onError(e); } }}><Trash2 /></Button>
                              </div>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
              <Card>
                <CardHeader title={t('common.details')} />
                <CardBody className="space-y-2 text-sm">
                  {[['suppliers.phone', s.phone], ['suppliers.whatsapp', s.whatsapp], ['suppliers.email', s.email], ['warehouses.address', s.address], ['suppliers.taxId', s.taxId]].map(([k, v]) => (
                    <p key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{t(k!)}</span><Num>{v || '—'}</Num></p>
                  ))}
                  {s.minOrderAmount && <p className="flex justify-between gap-3"><span className="text-muted-foreground">{t('suppliers.minOrderAmount')}</span><Num>{money(s.minOrderAmount, currency)}</Num></p>}
                  {s.notes && <p className="whitespace-pre-wrap rounded-md bg-muted p-2">{s.notes}</p>}
                </CardBody>
              </Card>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader title={t('nav.purchases')} />
                {s.orders.length === 0 ? <EmptyState /> : (
                  <Table>
                    <THead><tr><Th>{t('purchases.number')}</Th><Th>{t('purchases.orderDate')}</Th><Th className="text-end">{t('common.total')}</Th><Th>{t('common.status')}</Th></tr></THead>
                    <TBody>{s.orders.map((o) => <Tr key={o.id}><Td><Link href={`/purchases/${o.id}`} className="hover:underline"><Num>{o.number}</Num></Link></Td><Td>{date(o.orderDate)}</Td><Td className="text-end"><Num>{money(o.total, currency)}</Num></Td><Td><StatusBadge ns="purchases.statuses" status={o.status} /></Td></Tr>)}</TBody>
                  </Table>
                )}
              </Card>
              <Card>
                <CardHeader title={t('suppliers.priceHistory')} />
                {s.priceHistory.length === 0 ? <EmptyState /> : (
                  <Table>
                    <THead><tr><Th>{t('common.date')}</Th><Th>{t('common.product')}</Th><Th className="text-end">{t('suppliers.unitPrice')}</Th></tr></THead>
                    <TBody>{s.priceHistory.slice(0, 20).map((h) => <Tr key={h.id}><Td>{date(h.recordedAt)}</Td><Td>{pname.get(h.productId) ?? '—'}</Td><Td className="text-end"><Num>{money(h.unitPrice, currency)}</Num></Td></Tr>)}</TBody>
                  </Table>
                )}
              </Card>
            </div>

            {edit && <SupplierDialog open onOpenChange={setEdit} supplier={s} />}
            <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)} title={link?.name ?? ''} footer={<><Button variant="outline" onClick={() => setLink(null)}>{t('common.cancel')}</Button><Button type="submit" form="link-form">{t('common.save')}</Button></>}>
              {link && (
                <form id="link-form" onSubmit={saveLink} className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('suppliers.unitPrice')} htmlFor="lu" required><Input id="lu" required dir="ltr" inputMode="decimal" value={link.unitPrice} onChange={(e) => setLink({ ...link, unitPrice: e.target.value })} /></Field>
                  <Field label={t('suppliers.supplierSku')} htmlFor="ls"><Input id="ls" dir="ltr" value={link.supplierSku} onChange={(e) => setLink({ ...link, supplierSku: e.target.value })} /></Field>
                  <Field label={t('suppliers.moq')} htmlFor="lm"><Input id="lm" dir="ltr" inputMode="decimal" value={link.minOrderQty} onChange={(e) => setLink({ ...link, minOrderQty: e.target.value })} /></Field>
                  <Field label={t('suppliers.packSize')} htmlFor="lp"><Input id="lp" dir="ltr" inputMode="decimal" value={link.packSize} onChange={(e) => setLink({ ...link, packSize: e.target.value })} /></Field>
                  <Field label={t('suppliers.leadTime')} htmlFor="ll"><Input id="ll" dir="ltr" type="number" value={link.leadTimeDays} onChange={(e) => setLink({ ...link, leadTimeDays: e.target.value })} /></Field>
                  <Checkbox className="self-end" label={t('suppliers.preferred')} checked={link.isPreferred} onChange={(e) => setLink({ ...link, isPreferred: e.target.checked })} />
                </form>
              )}
            </Dialog>
          </div>
        );
      }}
    </QueryState>
  );
}

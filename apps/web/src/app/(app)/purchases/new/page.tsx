'use client';

import type { ProductListItem } from '@stockiteasy/api-client';
import { computeDocument } from '@stockiteasy/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { ProductPicker } from '@/components/products/product-picker';
import { Guard } from '@/components/shell/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { Num } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function NewPurchase() {
  const { t, money } = useI18n();
  const { org } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const suppliers = useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => api.suppliers.list({ pageSize: 200 }) });
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: api.warehouses.list });
  const [supplierId, setSupplierId] = useState(params.get('supplierId') ?? '');
  const [warehouseId, setWarehouseId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ product: ProductListItem; quantity: string; unitPrice: string; taxRate: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const supplier = useQuery({ queryKey: ['suppliers', supplierId], queryFn: () => api.suppliers.get(supplierId), enabled: !!supplierId });
  useEffect(() => {
    if (!warehouseId && warehouses.data?.[0]) setWarehouseId(warehouses.data[0].id);
  }, [warehouses.data, warehouseId]);
  useEffect(() => {
    if (supplier.data && !expectedDate) setExpectedDate(new Date(Date.now() + supplier.data.leadTimeDays * 86400_000).toISOString().slice(0, 10));
  }, [supplier.data, expectedDate]);
  const totals = useMemo(() => {
    try {
      return computeDocument(lines.map((l) => ({ quantity: l.quantity || '0', unitPrice: l.unitPrice || '0', taxRate: l.taxRate })));
    } catch {
      return null;
    }
  }, [lines]);

  const addLine = (p: ProductListItem) => {
    if (lines.some((l) => l.product.id === p.id)) return;
    const sp = supplier.data?.products.find((x) => x.productId === p.id);
    setLines([...lines, { product: p, quantity: sp?.minOrderQty ?? '1', unitPrice: sp?.unitPrice ?? p.purchasePrice, taxRate: p.taxRate }]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const po = await api.purchases.create({ supplierId, warehouseId, expectedDate: expectedDate || null, notes: notes || null, lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate })) });
      await qc.invalidateQueries({ queryKey: ['purchases'] });
      router.push(`/purchases/${po.id}`);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <PageHeader title={t('purchases.new')} actions={<Button type="submit" loading={busy} disabled={!supplierId || !warehouseId || !lines.length}>{t('common.save')}</Button>} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t('common.lines')} />
          <div className="border-b border-border p-3"><ProductPicker onPick={addLine} warehouseId={warehouseId || undefined} /></div>
          <Table>
            <THead><tr><Th>{t('common.product')}</Th><Th className="w-28 text-end">{t('common.quantity')}</Th><Th className="w-32 text-end">{t('suppliers.unitPrice')}</Th><Th className="text-end">{t('common.total')}</Th><Th /></tr></THead>
            <TBody>
              {lines.map((l, i) => (
                <Tr key={l.product.id}>
                  <Td>{l.product.name} <Num className="text-xs text-muted-foreground">{l.product.sku}</Num></Td>
                  <Td><Input className="text-end" dir="ltr" inputMode="decimal" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} aria-label={t('common.quantity')} /></Td>
                  <Td><Input className="text-end" dir="ltr" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} aria-label={t('suppliers.unitPrice')} /></Td>
                  <Td className="text-end"><Num>{totals ? money(totals.lines[i]?.total.toFixed(3), org?.currency) : '—'}</Num></Td>
                  <Td><Button type="button" size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={t('common.removeLine')}><Trash2 /></Button></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardBody className="space-y-4">
            <Field label={t('common.supplier')} htmlFor="ps" required>
              <Select id="ps" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">—</option>{suppliers.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Field>
            <Field label={t('common.warehouse')} htmlFor="pw"><Select id="pw" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>{warehouses.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
            <Field label={t('purchases.expectedDate')} htmlFor="pd"><Input id="pd" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></Field>
            <Field label={t('common.note')} htmlFor="pn"><Textarea id="pn" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            {totals && (
              <dl className="space-y-1 border-t border-border pt-3 text-sm">
                <div className="flex justify-between"><dt>{t('common.subtotal')}</dt><dd><Num>{money(totals.subtotal.toFixed(3), org?.currency)}</Num></dd></div>
                <div className="flex justify-between"><dt>{t('common.tax')}</dt><dd><Num>{money(totals.taxTotal.toFixed(3), org?.currency)}</Num></dd></div>
                <div className="flex justify-between text-base font-bold"><dt>{t('common.totalTtc')}</dt><dd><Num>{money(totals.total.toFixed(3), org?.currency)}</Num></dd></div>
              </dl>
            )}
          </CardBody>
        </Card>
      </div>
    </form>
  );
}

export default function NewPurchasePage() {
  return <Guard permission="purchases.create"><Suspense><NewPurchase /></Suspense></Guard>;
}

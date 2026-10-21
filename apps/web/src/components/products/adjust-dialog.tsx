'use client';

import { ADJUSTMENT_REASONS } from '@stockiteasy/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n';

/** Manual stock adjustment or block/unblock, always with a reason (traceable movement). */
export function AdjustDialog({
  open,
  onOpenChange,
  productId,
  mode = 'adjust',
  needsLot,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  productId?: string;
  mode?: 'adjust' | 'block';
  needsLot?: boolean;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: api.warehouses.list, enabled: open });
  const [search, setSearch] = useState('');
  const products = useQuery({ queryKey: ['products', 'pick', search], queryFn: () => api.products.list({ search, pageSize: 20 }), enabled: open && !productId });
  const [f, setF] = useState({ productId: productId ?? '', warehouseId: '', direction: 'IN' as 'IN' | 'OUT', action: 'BLOCK' as 'BLOCK' | 'UNBLOCK', quantity: '', reason: 'CORRECTION', note: '', unitCost: '', lotNumber: '', expiryDate: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (warehouses.data?.length && !f.warehouseId) setF((x) => ({ ...x, warehouseId: warehouses.data[0].id }));
  }, [warehouses.data, f.warehouseId]);
  useEffect(() => setF((x) => ({ ...x, productId: productId ?? x.productId })), [productId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'block') {
        await api.inventory.block({ productId: f.productId, warehouseId: f.warehouseId, quantity: f.quantity, action: f.action, reason: f.reason, note: f.note || undefined });
      } else {
        await api.inventory.adjust({
          productId: f.productId,
          warehouseId: f.warehouseId,
          direction: f.direction,
          quantity: f.quantity,
          reason: f.reason,
          note: f.note || undefined,
          unitCost: f.direction === 'IN' && f.unitCost ? f.unitCost : undefined,
          lotNumber: f.lotNumber || undefined,
          expiryDate: f.expiryDate || undefined,
        });
      }
      toast.success(t('movements.adjusted'));
      await Promise.all([qc.invalidateQueries({ queryKey: ['products'] }), qc.invalidateQueries({ queryKey: ['movements'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
      onOpenChange(false);
      setF((x) => ({ ...x, quantity: '', note: '', unitCost: '', lotNumber: '', expiryDate: '' }));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'block' ? t('movements.blockTitle') : t('movements.newAdjustment')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" form="adjust-form" loading={busy} disabled={!f.productId || !f.quantity}>{t('common.validate')}</Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="grid gap-4">
        {!productId && (
          <Field label={t('common.product')} htmlFor="p">
            <Input placeholder={t('common.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
            <Select id="p" value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              {products.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('common.warehouse')} htmlFor="w">
          <Select id="w" value={f.warehouseId} onChange={(e) => setF({ ...f, warehouseId: e.target.value })}>
            {warehouses.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(mode === 'block' ? (['BLOCK', 'UNBLOCK'] as const) : (['IN', 'OUT'] as const)).map((d) => {
            const active = mode === 'block' ? f.action === d : f.direction === d;
            return (
              <button
                type="button"
                key={d}
                role="radio"
                aria-checked={active}
                onClick={() => setF(mode === 'block' ? { ...f, action: d as 'BLOCK' | 'UNBLOCK' } : { ...f, direction: d as 'IN' | 'OUT' })}
                className={cn('rounded-lg border px-3 py-2.5 text-sm font-semibold', active ? (d === 'IN' || d === 'UNBLOCK' ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger') : 'border-border')}
              >
                {d === 'IN' ? t('movements.in') : d === 'OUT' ? t('movements.out') : d === 'BLOCK' ? t('movements.block') : t('movements.unblock')}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.quantity')} htmlFor="q"><Input id="q" required dir="ltr" inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
          <Field label={t('common.reason')} htmlFor="r">
            <Select id="r" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
              {ADJUSTMENT_REASONS.map((r) => <option key={r} value={r}>{t(`movements.reasons.${r}`)}</option>)}
            </Select>
          </Field>
        </div>
        {mode === 'adjust' && f.direction === 'IN' && (
          <Field label={t('movements.unitCost')} htmlFor="c"><Input id="c" dir="ltr" inputMode="decimal" value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value })} /></Field>
        )}
        {mode === 'adjust' && needsLot && f.direction === 'IN' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('products.lotNumber')} htmlFor="lot"><Input id="lot" dir="ltr" required value={f.lotNumber} onChange={(e) => setF({ ...f, lotNumber: e.target.value })} /></Field>
            <Field label={t('products.expiryDate')} htmlFor="exp"><Input id="exp" type="date" value={f.expiryDate} onChange={(e) => setF({ ...f, expiryDate: e.target.value })} /></Field>
          </div>
        )}
        <Field label={t('common.note')} htmlFor="n"><Textarea id="n" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </form>
    </Dialog>
  );
}

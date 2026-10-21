'use client';

import type { Supplier } from '@stockiteasy/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useI18n } from '@/providers/i18n';

const empty = { name: '', code: '', contactName: '', phone: '', whatsapp: '', email: '', city: '', address: '', taxId: '', paymentTermsDays: '0', leadTimeDays: '7', minOrderAmount: '', notes: '' };

export function SupplierDialog({ open, onOpenChange, supplier }: { open: boolean; onOpenChange: (o: boolean) => void; supplier?: Supplier }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [f, setF] = useState(() =>
    supplier
      ? Object.fromEntries(Object.keys(empty).map((k) => [k, String((supplier as unknown as Record<string, unknown>)[k] ?? '')])) as typeof empty
      : empty,
  );
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof empty, label: string, opts: { ltr?: boolean; type?: string } = {}) => (
    <Field label={label} htmlFor={`s-${k}`}>
      <Input id={`s-${k}`} type={opts.type} dir={opts.ltr ? 'ltr' : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])),
        name: f.name,
        paymentTermsDays: Number(f.paymentTermsDays || 0),
        leadTimeDays: Number(f.leadTimeDays || 7),
        isActive: true,
      };
      if (supplier) await api.suppliers.update(supplier.id, body);
      else await api.suppliers.create(body);
      await qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(t('common.saved'));
      onOpenChange(false);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} side title={supplier ? t('common.edit') : t('suppliers.new')} footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button type="submit" form="sup-form" loading={busy} disabled={f.name.length < 2}>{t('common.save')}</Button></>}>
      <form id="sup-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{field('name', t('common.name'))}</div>
        {field('code', t('common.code'), { ltr: true })}
        {field('contactName', t('suppliers.contactName'))}
        {field('phone', t('suppliers.phone'), { ltr: true, type: 'tel' })}
        {field('whatsapp', t('suppliers.whatsapp'), { ltr: true, type: 'tel' })}
        {field('email', t('suppliers.email'), { ltr: true, type: 'email' })}
        {field('city', t('warehouses.city'))}
        <div className="sm:col-span-2">{field('address', t('warehouses.address'))}</div>
        {field('taxId', t('suppliers.taxId'), { ltr: true })}
        {field('minOrderAmount', t('suppliers.minOrderAmount'), { ltr: true })}
        {field('paymentTermsDays', t('suppliers.paymentTerms'), { ltr: true, type: 'number' })}
        {field('leadTimeDays', t('suppliers.leadTime'), { ltr: true, type: 'number' })}
        <Field label={t('common.note')} htmlFor="s-notes" className="sm:col-span-2"><Textarea id="s-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </form>
    </Dialog>
  );
}

'use client';

import type { Customer } from '@stockiteasy/api-client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Guard } from '@/components/shell/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { PageHeader, Pagination, SearchInput } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useDebounced, useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

type CForm = { id?: string; name: string; phone: string; email: string; city: string; address: string; taxId: string; creditLimit: string; notes: string };
const blank: CForm = { name: '', phone: '', email: '', city: '', address: '', taxId: '', creditLimit: '', notes: '' };

function CustomersScreen() {
  const { t, money } = useI18n();
  const { can, org } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<CForm | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(search);
  const query = useQuery({ queryKey: ['customers', q, page], queryFn: () => api.customers.list({ search: q, page }), placeholderData: keepPreviousData });
  const edit = (c: Customer) => setForm({ id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '', city: c.city ?? '', address: c.address ?? '', taxId: c.taxId ?? '', creditLimit: c.creditLimit ?? '', notes: c.notes ?? '' });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const { id, ...rest } = form;
      const body = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]));
      body.name = form.name;
      if (id) await api.customers.update(id, body);
      else await api.customers.create(body);
      await qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(t('common.saved'));
      setForm(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  const input = (k: keyof CForm, label: string, ltr = false) => (
    <Field label={label} htmlFor={`c-${k}`}><Input id={`c-${k}`} dir={ltr ? 'ltr' : undefined} value={form?.[k] ?? ''} onChange={(e) => setForm({ ...form!, [k]: e.target.value })} /></Field>
  );
  return (
    <div>
      <PageHeader title={t('customers.title')} actions={can('customers.create') && <Button onClick={() => setForm(blank)}><Plus /> {t('customers.new')}</Button>} />
      <Card>
        <div className="border-b border-border p-3"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('common.search')} /></div>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState description={t('customers.empty')} />}>
          {(data) => (
            <>
              <Table>
                <THead><tr><Th>{t('common.name')}</Th><Th>{t('suppliers.phone')}</Th><Th>{t('warehouses.city')}</Th><Th className="text-end">{t('customers.creditLimit')}</Th><Th className="text-end">{t('customers.balance')}</Th><Th className="text-end">{t('customers.salesCount')}</Th><Th /></tr></THead>
                <TBody>
                  {data.items.map((c) => (
                    <Tr key={c.id}>
                      <Td className="font-medium">{c.name}{c.isDemo && <Badge tone="demo" className="ms-2">{t('app.demoBadge')}</Badge>}</Td>
                      <Td><Num>{c.phone ?? '—'}</Num></Td>
                      <Td>{c.city ?? '—'}</Td>
                      <Td className="text-end"><Num>{c.creditLimit ? money(c.creditLimit, org?.currency) : '—'}</Num></Td>
                      <Td className={`text-end font-semibold ${Number(c.balance) > 0 ? 'text-danger' : ''}`}><Num>{money(c.balance, org?.currency)}</Num></Td>
                      <Td className="text-end"><Num>{c._count?.sales ?? 0}</Num></Td>
                      <Td className="text-end">{can('customers.update') && <Button size="icon" variant="ghost" onClick={() => edit(c)} aria-label={t('common.edit')}><Pencil /></Button>}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)} side title={form?.id ? t('common.edit') : t('customers.new')} footer={<><Button variant="outline" onClick={() => setForm(null)}>{t('common.cancel')}</Button><Button type="submit" form="cust-form" loading={busy} disabled={(form?.name.length ?? 0) < 2}>{t('common.save')}</Button></>}>
        <form id="cust-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{input('name', t('common.name'))}</div>
          {input('phone', t('suppliers.phone'), true)}
          {input('email', t('suppliers.email'), true)}
          {input('city', t('warehouses.city'))}
          {input('taxId', t('suppliers.taxId'), true)}
          <div className="sm:col-span-2">{input('address', t('warehouses.address'))}</div>
          {input('creditLimit', t('customers.creditLimit'), true)}
          <Field label={t('common.note')} htmlFor="c-notes" className="sm:col-span-2"><Textarea id="c-notes" value={form?.notes ?? ''} onChange={(e) => setForm({ ...form!, notes: e.target.value })} /></Field>
        </form>
      </Dialog>
    </div>
  );
}

export default function CustomersPage() {
  return <Guard permission="customers.read"><CustomersScreen /></Guard>;
}

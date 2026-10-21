'use client';

import type { Warehouse } from '@stockiteasy/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Store as StoreIcon } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Guard } from '@/components/shell/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

type WForm = { id?: string; name: string; code: string; city: string; storeId: string; isActive: boolean };
type SForm = { id?: string; name: string; code: string; city: string; address: string };

function LocationsDialog({ warehouse, onClose }: { warehouse: Warehouse | null; onClose: () => void }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const locations = useQuery({ queryKey: ['locations', warehouse?.id], queryFn: () => api.warehouses.locations(warehouse!.id), enabled: !!warehouse });
  const [f, setF] = useState({ code: '', zone: '', aisle: '', shelf: '', bin: '' });
  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.warehouses.createLocation(warehouse!.id, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || null])));
      setF({ code: '', zone: '', aisle: '', shelf: '', bin: '' });
      await qc.invalidateQueries({ queryKey: ['locations', warehouse?.id] });
    } catch (err) {
      onError(err);
    }
  };
  return (
    <Dialog open={!!warehouse} onOpenChange={(o) => !o && onClose()} title={`${t('warehouses.locations')} — ${warehouse?.name ?? ''}`} size="lg">
      {can('warehouses.create') && (
        <form onSubmit={add} className="mb-4 grid grid-cols-2 items-end gap-2 sm:grid-cols-6">
          <Field label={t('common.code')} htmlFor="lc"><Input id="lc" required dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <Field label={t('warehouses.zone')} htmlFor="lz"><Input id="lz" value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} /></Field>
          <Field label={t('warehouses.aisle')} htmlFor="la"><Input id="la" value={f.aisle} onChange={(e) => setF({ ...f, aisle: e.target.value })} /></Field>
          <Field label={t('warehouses.shelf')} htmlFor="ls"><Input id="ls" value={f.shelf} onChange={(e) => setF({ ...f, shelf: e.target.value })} /></Field>
          <Field label={t('warehouses.bin')} htmlFor="lb"><Input id="lb" value={f.bin} onChange={(e) => setF({ ...f, bin: e.target.value })} /></Field>
          <Button type="submit"><Plus /> {t('common.add')}</Button>
        </form>
      )}
      <QueryState query={locations} isEmpty={(d) => d.length === 0}>
        {(locs) => (
          <Table>
            <THead><tr><Th>{t('common.code')}</Th><Th>{t('warehouses.zone')}</Th><Th>{t('warehouses.aisle')}</Th><Th>{t('warehouses.shelf')}</Th><Th>{t('warehouses.bin')}</Th></tr></THead>
            <TBody>{locs.map((l) => <Tr key={l.id}><Td><Num>{l.code}</Num></Td><Td>{l.zone ?? '—'}</Td><Td>{l.aisle ?? '—'}</Td><Td>{l.shelf ?? '—'}</Td><Td>{l.bin ?? '—'}</Td></Tr>)}</TBody>
          </Table>
        )}
      </QueryState>
    </Dialog>
  );
}

function WarehousesScreen() {
  const { t, money, num } = useI18n();
  const { can, org } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: api.warehouses.list });
  const stores = useQuery({ queryKey: ['stores'], queryFn: api.stores.list });
  const [w, setW] = useState<WForm | null>(null);
  const [s, setS] = useState<SForm | null>(null);
  const [loc, setLoc] = useState<Warehouse | null>(null);
  const [busy, setBusy] = useState(false);

  const saveW = async (e: FormEvent) => {
    e.preventDefault();
    if (!w) return;
    setBusy(true);
    try {
      const body = { name: w.name, code: w.code, city: w.city || null, storeId: w.storeId || null, isActive: w.isActive };
      if (w.id) await api.warehouses.update(w.id, body);
      else await api.warehouses.create(body);
      await qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(t('common.saved'));
      setW(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  const saveS = async (e: FormEvent) => {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    try {
      const body = { name: s.name, code: s.code, city: s.city || null, address: s.address || null };
      if (s.id) await api.stores.update(s.id, body);
      else await api.stores.create(body);
      await qc.invalidateQueries({ queryKey: ['stores'] });
      toast.success(t('common.saved'));
      setS(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('warehouses.title')}
        actions={can('warehouses.create') && (
          <>
            <Button variant="outline" onClick={() => setS({ name: '', code: '', city: '', address: '' })}><StoreIcon /> {t('warehouses.newStore')}</Button>
            <Button onClick={() => setW({ name: '', code: '', city: '', storeId: '', isActive: true })}><Plus /> {t('warehouses.newWarehouse')}</Button>
          </>
        )}
      />
      <Card>
        <QueryState query={warehouses} isEmpty={(d) => d.length === 0} empty={<EmptyState description={t('warehouses.empty')} />}>
          {(list) => (
            <Table>
              <THead><tr><Th>{t('common.name')}</Th><Th>{t('common.code')}</Th><Th>{t('warehouses.store')}</Th><Th>{t('warehouses.city')}</Th><Th className="text-end">{t('dashboard.quantityOnHand')}</Th><Th className="text-end">{t('warehouses.stockValue')}</Th><Th /></tr></THead>
              <TBody>
                {list.map((wh) => (
                  <Tr key={wh.id}>
                    <Td className="font-medium">{wh.name} {!wh.isActive && <Badge className="ms-2">{t('products.statusINACTIVE')}</Badge>}</Td>
                    <Td><Num>{wh.code}</Num></Td>
                    <Td>{wh.store?.name ?? '—'}</Td>
                    <Td>{wh.city ?? '—'}</Td>
                    <Td className="text-end"><Num>{num(wh.units, 0)}</Num></Td>
                    <Td className="text-end font-semibold"><Num>{money(wh.stockValue, org?.currency)}</Num></Td>
                    <Td className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setLoc(wh)}><MapPin /> <Num>{wh._count.locations}</Num></Button>
                        {can('warehouses.update') && <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => setW({ id: wh.id, name: wh.name, code: wh.code, city: wh.city ?? '', storeId: wh.storeId ?? '', isActive: wh.isActive })}><Pencil /></Button>}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </QueryState>
      </Card>

      <Card className="mt-5">
        <CardHeader title={t('warehouses.stores')} />
        <QueryState query={stores} isEmpty={(d) => d.length === 0}>
          {(list) => (
            <Table>
              <THead><tr><Th>{t('common.name')}</Th><Th>{t('common.code')}</Th><Th>{t('warehouses.city')}</Th><Th>{t('warehouses.address')}</Th><Th /></tr></THead>
              <TBody>
                {list.map((st) => (
                  <Tr key={st.id}>
                    <Td className="font-medium">{st.name}</Td><Td><Num>{st.code}</Num></Td><Td>{st.city ?? '—'}</Td><Td>{st.address ?? '—'}</Td>
                    <Td className="text-end">{can('warehouses.update') && <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => setS({ id: st.id, name: st.name, code: st.code, city: st.city ?? '', address: st.address ?? '' })}><Pencil /></Button>}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </QueryState>
      </Card>

      <Dialog open={!!w} onOpenChange={(o) => !o && setW(null)} title={w?.id ? t('common.edit') : t('warehouses.newWarehouse')} footer={<><Button variant="outline" onClick={() => setW(null)}>{t('common.cancel')}</Button><Button type="submit" form="wh-form" loading={busy}>{t('common.save')}</Button></>}>
        {w && (
          <form id="wh-form" onSubmit={saveW} className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.name')} htmlFor="wn" required><Input id="wn" required value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Field>
            <Field label={t('common.code')} htmlFor="wc" required><Input id="wc" required dir="ltr" value={w.code} onChange={(e) => setW({ ...w, code: e.target.value.toUpperCase() })} /></Field>
            <Field label={t('warehouses.city')} htmlFor="wci"><Input id="wci" value={w.city} onChange={(e) => setW({ ...w, city: e.target.value })} /></Field>
            <Field label={t('warehouses.store')} htmlFor="ws">
              <Select id="ws" value={w.storeId} onChange={(e) => setW({ ...w, storeId: e.target.value })}>
                <option value="">—</option>
                {stores.data?.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </Select>
            </Field>
            <Checkbox label={t('warehouses.active')} checked={w.isActive} onChange={(e) => setW({ ...w, isActive: e.target.checked })} />
          </form>
        )}
      </Dialog>
      <Dialog open={!!s} onOpenChange={(o) => !o && setS(null)} title={s?.id ? t('common.edit') : t('warehouses.newStore')} footer={<><Button variant="outline" onClick={() => setS(null)}>{t('common.cancel')}</Button><Button type="submit" form="st-form" loading={busy}>{t('common.save')}</Button></>}>
        {s && (
          <form id="st-form" onSubmit={saveS} className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.name')} htmlFor="sn" required><Input id="sn" required value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
            <Field label={t('common.code')} htmlFor="sc" required><Input id="sc" required dir="ltr" value={s.code} onChange={(e) => setS({ ...s, code: e.target.value.toUpperCase() })} /></Field>
            <Field label={t('warehouses.city')} htmlFor="sci"><Input id="sci" value={s.city} onChange={(e) => setS({ ...s, city: e.target.value })} /></Field>
            <Field label={t('warehouses.address')} htmlFor="sa"><Input id="sa" value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} /></Field>
          </form>
        )}
      </Dialog>
      <LocationsDialog warehouse={loc} onClose={() => setLoc(null)} />
    </div>
  );
}

export default function WarehousesPage() {
  return <Guard permission="warehouses.read"><WarehousesScreen /></Guard>;
}

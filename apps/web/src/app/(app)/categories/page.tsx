'use client';

import type { Category } from '@stockiteasy/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Guard } from '@/components/shell/require-auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function CategoriesScreen() {
  const { t } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const query = useQuery({ queryKey: ['categories'], queryFn: api.categories.list });
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!edit?.name) return;
    setBusy(true);
    try {
      const body = { name: edit.name, parentId: edit.parentId || null };
      if (edit.id) await api.categories.update(edit.id, body);
      else await api.categories.create(body);
      await qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success(t('common.saved'));
      setEdit(null);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  const byId = new Map(query.data?.map((c) => [c.id, c]));
  return (
    <div>
      <PageHeader title={t('categories.title')} actions={can('categories.create') && <Button onClick={() => setEdit({ name: '' })}><Plus /> {t('categories.new')}</Button>} />
      <Card>
        <QueryState query={query} isEmpty={(d) => d.length === 0} empty={<EmptyState description={t('categories.empty')} />}>
          {(cats) => (
            <Table>
              <THead><tr><Th>{t('common.name')}</Th><Th>{t('categories.parent')}</Th><Th className="text-end">{t('common.products')}</Th><Th /></tr></THead>
              <TBody>
                {cats.map((c) => (
                  <Tr key={c.id}>
                    <Td className="font-medium">{c.name}</Td>
                    <Td className="text-muted-foreground">{c.parentId ? byId.get(c.parentId)?.name : '—'}</Td>
                    <Td className="text-end"><Num>{c.productsCount}</Num></Td>
                    <Td className="text-end">
                      <div className="flex justify-end gap-1">
                        {can('categories.update') && <Button size="icon" variant="ghost" onClick={() => setEdit(c)} aria-label={t('common.edit')}><Pencil /></Button>}
                        {can('categories.delete') && (
                          <ConfirmButton variant="ghost" size="sm" onConfirm={async () => { try { await api.categories.remove(c.id); await qc.invalidateQueries({ queryKey: ['categories'] }); } catch (e) { onError(e); } }}>
                            <Trash2 />
                          </ConfirmButton>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </QueryState>
      </Card>
      <Dialog
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? t('common.edit') : t('categories.new')}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button type="submit" form="cat-form" loading={busy}>{t('common.save')}</Button></>}
      >
        <form id="cat-form" onSubmit={save} className="space-y-4">
          <Field label={t('common.name')} htmlFor="cn" required><Input id="cn" required autoFocus value={edit?.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label={t('categories.parent')} htmlFor="cp">
            <Select id="cp" value={edit?.parentId ?? ''} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })}>
              <option value="">—</option>
              {query.data?.filter((c) => c.id !== edit?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </form>
      </Dialog>
    </div>
  );
}

export default function CategoriesPage() {
  return <Guard permission="categories.read"><CategoriesScreen /></Guard>;
}

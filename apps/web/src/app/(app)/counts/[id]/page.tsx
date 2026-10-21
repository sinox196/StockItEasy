'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScanBarcode } from 'lucide-react';
import { FormEvent, use, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ProductPicker } from '@/components/products/product-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { Num, QueryState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

export default function CountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, num, money } = useI18n();
  const { can, org } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const query = useQuery({ queryKey: ['counts', id], queryFn: () => api.counts.get(id) });
  const [code, setCode] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['counts', id] });

  const record = async (productId: string, countedQty: string, mode: 'replace' | 'add') => {
    try {
      await api.counts.record(id, { productId, countedQty, mode });
      await refresh();
    } catch (e) {
      onError(e);
    }
  };

  const scan = async (e: FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setCode('');
    try {
      const r = await api.products.lookup(value);
      await record(r.product.id, r.unitFactor, 'add');
      toast.success(`${r.product.name} +${num(r.unitFactor)}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') toast.error(t('pos.notFound', { code: value }));
      else onError(err);
    } finally {
      scanRef.current?.focus();
    }
  };

  return (
    <QueryState query={query}>
      {(c) => {
        const editable = c.status === 'IN_PROGRESS' && can('stock_counts.update');
        const counted = c.lines?.filter((l) => l.countedQty !== null).length ?? 0;
        const varianceValue = c.lines?.reduce((a, l) => a + Number(l.varianceValue ?? 0), 0) ?? 0;
        return (
          <div>
            <PageHeader
              title={<Num>{c.number}</Num>}
              badge={<StatusBadge ns="counts.statuses" status={c.status} />}
              description={`${c.warehouse?.name} · ${t(`counts.scopes.${c.scope}`)} · ${t('counts.progress', { counted, total: c.lines?.length ?? 0 })}`}
              actions={
                c.status === 'IN_PROGRESS' && can('stock_counts.approve') && (
                  <>
                    <ConfirmButton variant="outline" onConfirm={async () => { try { await api.counts.cancel(id); await refresh(); } catch (e) { onError(e); } }}>{t('common.cancel')}</ConfirmButton>
                    <ConfirmButton
                      variant="accent"
                      description={t('counts.validateConfirm')}
                      onConfirm={async () => {
                        try {
                          const r = await api.counts.validate(id);
                          toast.success(t('counts.validated', { count: r.adjustments }));
                          await refresh();
                        } catch (e) {
                          onError(e);
                        }
                      }}
                    >
                      {t('counts.validate')}
                    </ConfirmButton>
                  </>
                )
              }
            />
            {editable && (
              <div className="card mb-4 grid gap-3 p-3 md:grid-cols-2">
                <form onSubmit={scan} className="relative">
                  <ScanBarcode className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <input ref={scanRef} autoFocus dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('counts.scanToCount')} className="h-12 w-full rounded-lg border border-border bg-surface ps-11 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25" aria-label={t('counts.scanToCount')} />
                </form>
                <ProductPicker onPick={(p) => record(p.id, '1', 'add')} />
              </div>
            )}
            <Card>
              <Table>
                <THead><tr><Th>{t('common.product')}</Th><Th className="text-end">{t('counts.expected')}</Th><Th className="text-end">{t('counts.counted')}</Th><Th className="text-end">{t('counts.variance')}</Th><Th className="text-end">{t('counts.varianceValue')}</Th></tr></THead>
                <TBody>
                  {c.lines?.map((l) => (
                    <Tr key={l.id}>
                      <Td>{l.product?.name} <Num className="text-xs text-muted-foreground">{l.product?.sku}</Num></Td>
                      <Td className="text-end"><Num>{num(l.expectedQty)}</Num></Td>
                      <Td className="text-end">
                        {editable ? (
                          <Input
                            key={`${l.id}-${l.version}`}
                            className="ms-auto w-24 text-end"
                            dir="ltr"
                            inputMode="decimal"
                            defaultValue={l.countedQty ?? ''}
                            placeholder={t('counts.notCounted')}
                            onBlur={(e) => e.target.value !== (l.countedQty ?? '') && e.target.value !== '' && record(l.productId, e.target.value.replace(',', '.'), 'replace')}
                            aria-label={t('counts.counted')}
                          />
                        ) : <Num>{l.countedQty === null ? '—' : num(l.countedQty)}</Num>}
                      </Td>
                      <Td className={`text-end font-semibold ${Number(l.variance ?? 0) < 0 ? 'text-danger' : Number(l.variance ?? 0) > 0 ? 'text-success' : ''}`}><Num>{l.variance === null ? '—' : num(l.variance)}</Num></Td>
                      <Td className="text-end"><Num>{l.varianceValue === null ? '—' : money(l.varianceValue, org?.currency)}</Num></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <div className="flex justify-end border-t border-border px-4 py-3 text-sm font-semibold">{t('counts.varianceValue')}: <Num className="ms-2">{money(varianceValue, org?.currency)}</Num></div>
            </Card>
          </div>
        );
      }}
    </QueryState>
  );
}

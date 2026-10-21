'use client';

import type { Recommendation } from '@stockiteasy/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Pencil, RefreshCw, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Guard } from '@/components/shell/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { PageHeader, TabsBar } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

const PRIORITY_TONE = { CRITICAL: 'danger', RECOMMENDED: 'warning', DEFERRABLE: 'neutral' } as const;
const CONF_TONE = { HIGH: 'success', MEDIUM: 'info', LOW: 'neutral' } as const;

function RecommendationCard({ r, onDecide, canDecide }: { r: Recommendation; onDecide: (r: Recommendation, d: 'APPROVE' | 'MODIFY' | 'REJECT') => void; canDecide: boolean }) {
  const { t, num, money, date, dateTime } = useI18n();
  const { org } = useAuth();
  const [open, setOpen] = useState(false);
  const cell = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/products/${r.productId}`} className="font-semibold hover:underline">{r.product?.name}</Link>
          <p className="text-xs text-muted-foreground"><Num>{r.product?.sku}</Num> · {r.warehouse?.name} · {r.supplier?.name ?? t('autopilot.noSupplier')}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={PRIORITY_TONE[r.priority]}>{t(`autopilot.priority${r.priority}`)}</Badge>
          <Badge tone={CONF_TONE[r.confidence]}>{t('autopilot.confidence')}: {t(`autopilot.confidence${r.confidence}`)}</Badge>
          {r.status !== 'OPEN' && <Badge>{t(`autopilot.status${r.status}`)}</Badge>}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
        {cell(t('autopilot.available'), <Num>{num(r.available)} {r.product?.baseUnit}</Num>)}
        {cell(t('autopilot.avgSales'), <Num>{r.averageDaily === null ? '—' : num(r.averageDaily, 2)}</Num>)}
        {cell(t('autopilot.leadTime'), <Num>{t('common.days', { count: r.leadTimeDays })}</Num>)}
        {cell(t('autopilot.stockoutDate'), r.stockoutDate ? date(r.stockoutDate) : '—')}
        {cell(t('autopilot.suggestedQty'), <Num className="text-secondary">{num(r.suggestedQty)}</Num>)}
        {cell(t('autopilot.estimatedCost'), <Num>{money(r.estimatedCost, org?.currency)}</Num>)}
        {cell(t('autopilot.method'), t(`autopilot.method${r.method}`))}
      </dl>
      <ul className="mt-3 list-disc space-y-0.5 ps-5 text-sm text-muted-foreground">
        {r.reasons.map((x, i) => <li key={i}>{t(x.key, x.params)}</li>)}
      </ul>
      <button type="button" onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-secondary" aria-expanded={open}>
        {t('autopilot.assumptions')} <ChevronDown className={`size-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted p-3 text-xs sm:grid-cols-4">
          {Object.entries(r.assumptions).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{t(`autopilot.assumption.${k}`)}</dt><dd><Num>{v === null ? '—' : String(v)}</Num></dd></div>
          ))}
          <div className="col-span-full text-muted-foreground">{t('autopilot.lastRun', { date: dateTime(r.computedAt) })}</div>
        </dl>
      )}
      {r.status === 'OPEN' && canDecide && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="accent" onClick={() => onDecide(r, r.supplierId ? 'APPROVE' : 'MODIFY')}><Check /> {t('common.approve')}</Button>
          <Button size="sm" variant="outline" onClick={() => onDecide(r, 'MODIFY')}><Pencil /> {t('common.modify')}</Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => onDecide(r, 'REJECT')}><X /> {t('common.reject')}</Button>
        </div>
      )}
      {r.purchaseOrderId && <Link href={`/purchases/${r.purchaseOrderId}`} className="mt-3 inline-block text-sm text-secondary hover:underline">{t('nav.purchases')} →</Link>}
    </li>
  );
}

function AutopilotScreen() {
  const { t, dateTime } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [tab, setTab] = useState('OPEN');
  const [running, setRunning] = useState(false);
  const [decision, setDecision] = useState<{ r: Recommendation; d: 'APPROVE' | 'MODIFY' | 'REJECT'; quantity: string; supplierId: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['autopilot', tab], queryFn: () => api.autopilot.list(tab) });
  const suppliers = useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => api.suppliers.list({ pageSize: 200 }), enabled: !!decision });

  const run = async () => {
    setRunning(true);
    try {
      await api.autopilot.run();
      await qc.invalidateQueries({ queryKey: ['autopilot'] });
    } catch (e) {
      onError(e);
    } finally {
      setRunning(false);
    }
  };
  const decide = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      const res = await api.autopilot.decide(decision.r.id, {
        decision: decision.d,
        quantity: decision.d === 'MODIFY' ? decision.quantity : undefined,
        supplierId: decision.supplierId || undefined,
        reason: decision.reason || undefined,
      });
      toast.success(decision.d === 'REJECT' ? t('autopilot.rejected') : t('autopilot.approved', { number: res.purchaseOrderNumber ?? '' }));
      await qc.invalidateQueries({ queryKey: ['autopilot'] });
      await qc.invalidateQueries({ queryKey: ['purchases'] });
      setDecision(null);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><Sparkles className="size-6 text-secondary" /> {t('autopilot.title')}</span>}
        description={t('autopilot.subtitle')}
        actions={<Button variant="outline" onClick={run} loading={running}><RefreshCw /> {t('autopilot.run')}</Button>}
      />
      <TabsBar value={tab} onChange={setTab} items={['OPEN', 'APPROVED', 'MODIFIED', 'REJECTED'].map((s) => ({ value: s, label: t(`autopilot.status${s}`) }))} />
      {query.data?.computedAt && <p className="mb-3 text-xs text-muted-foreground">{t('autopilot.lastRun', { date: dateTime(query.data.computedAt) })}</p>}
      <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<Card><EmptyState description={t('autopilot.empty')} icon={<Sparkles className="size-6" />} /></Card>}>
        {(data) => (
          <ul className="space-y-3">
            {data.items.map((r) => (
              <RecommendationCard key={r.id} r={r} canDecide={can('autopilot.approve')} onDecide={(rec, d) => setDecision({ r: rec, d, quantity: rec.suggestedQty, supplierId: rec.supplierId ?? '', reason: '' })} />
            ))}
          </ul>
        )}
      </QueryState>
      <Dialog
        open={!!decision}
        onOpenChange={(o) => !o && setDecision(null)}
        size="sm"
        title={decision ? `${t(decision.d === 'APPROVE' ? 'common.approve' : decision.d === 'MODIFY' ? 'common.modify' : 'common.reject')} — ${decision.r.product?.name}` : ''}
        description={decision?.d !== 'REJECT' ? t('autopilot.approveHint') : undefined}
        footer={<><Button variant="outline" onClick={() => setDecision(null)}>{t('common.cancel')}</Button><Button variant={decision?.d === 'REJECT' ? 'danger' : 'accent'} loading={busy} onClick={decide} disabled={decision?.d !== 'REJECT' && !decision?.supplierId}>{t('common.confirm')}</Button></>}
      >
        {decision && (
          <div className="space-y-4">
            {decision.d === 'MODIFY' && <Field label={t('autopilot.suggestedQty')} htmlFor="dq"><Input id="dq" dir="ltr" inputMode="decimal" value={decision.quantity} onChange={(e) => setDecision({ ...decision, quantity: e.target.value })} /></Field>}
            {decision.d !== 'REJECT' && (
              <Field label={t('common.supplier')} htmlFor="ds" error={!decision.supplierId ? t('autopilot.noSupplier') : undefined}>
                <Select id="ds" value={decision.supplierId} onChange={(e) => setDecision({ ...decision, supplierId: e.target.value })}>
                  <option value="">—</option>
                  {suppliers.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label={t('common.reason')} htmlFor="dr"><Input id="dr" value={decision.reason} onChange={(e) => setDecision({ ...decision, reason: e.target.value })} /></Field>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default function AutopilotPage() {
  return <Guard permission="autopilot.read"><AutopilotScreen /></Guard>;
}

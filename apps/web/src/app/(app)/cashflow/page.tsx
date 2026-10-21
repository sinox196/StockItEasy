'use client';

import type { BudgetPlanItem } from '@stockiteasy/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Info, Wallet } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Guard } from '@/components/shell/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { KpiCard, PageHeader } from '@/components/ui/misc';
import { EmptyState, Num } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

/** Workflow F: needs → costs → budget check → prioritisation → simulation (projections only). */
function CashflowScreen() {
  const { t, money, num, date } = useI18n();
  const { org } = useAuth();
  const onError = useErrorToast();
  const orgQuery = useQuery({ queryKey: ['organization'], queryFn: api.organizations.current });
  const [budget, setBudget] = useState('');
  const plan = useMutation({ mutationFn: (b: string) => api.autopilot.budgetPlan(b), onError });
  useEffect(() => {
    if (orgQuery.data && budget === '') {
      const b = orgQuery.data.purchaseBudget ?? '0';
      setBudget(b);
      plan.mutate(b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgQuery.data]);
  const currency = org?.currency;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    plan.mutate(budget || '0');
  };
  const p = plan.data;
  const table = (items: BudgetPlanItem[], deferred = false) => (
    <Table>
      <THead><tr><Th>{t('common.product')}</Th><Th>{t('common.warehouse')}</Th><Th>{t('common.status')}</Th><Th className="text-end">{t('autopilot.suggestedQty')}</Th><Th className="text-end">{t('autopilot.estimatedCost')}</Th>{deferred && <Th>{t('autopilot.stockoutDate')}</Th>}</tr></THead>
      <TBody>
        {items.map((i) => (
          <Tr key={i.id}>
            <Td className="font-medium">{i.product?.name}</Td>
            <Td className="text-muted-foreground">{i.warehouse?.name}</Td>
            <Td><Badge tone={i.priority === 'CRITICAL' ? 'danger' : i.priority === 'RECOMMENDED' ? 'warning' : 'neutral'}>{t(`autopilot.priority${i.priority}`)}</Badge></Td>
            <Td className="text-end"><Num>{num(i.suggestedQty)}</Num></Td>
            <Td className="text-end"><Num>{money(i.estimatedCost, currency)}</Num></Td>
            {deferred && <Td className="text-sm text-amber-700 dark:text-warning">{i.stockoutDate ? t('autopilot.deferImpact', { date: date(i.stockoutDate) }) : t('autopilot.deferImpactUnknown')}</Td>}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><Wallet className="size-6 text-secondary" /> {t('autopilot.budgetTitle')}</span>} description={t('autopilot.subtitle')} />
      <form onSubmit={submit} className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('autopilot.budget')} ({currency})
          <Input dir="ltr" inputMode="decimal" className="w-48 text-lg" value={budget} onChange={(e) => setBudget(e.target.value.replace(',', '.'))} />
        </label>
        <Button type="submit" loading={plan.isPending}>{t('autopilot.simulate')}</Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="size-4" /> {t('common.projection')}</p>
      </form>
      {p && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard label={t('autopilot.budget')} value={<Num>{money(p.budget, currency)}</Num>} />
            <KpiCard label={t('autopilot.requested')} value={<Num>{money(p.requested, currency)}</Num>} />
            <KpiCard label={t('autopilot.funded')} value={<Num>{money(p.fundedCost, currency)}</Num>} tone="success" />
            <KpiCard label={t('autopilot.remainingBudget')} value={<Num>{money(p.remainingBudget, currency)}</Num>} />
            <KpiCard label={t('autopilot.shortfall')} value={<Num>{money(p.shortfall, currency)}</Num>} tone={Number(p.shortfall) > 0 ? 'warning' : 'default'} />
          </div>
          <Card className="mt-5">
            <CardHeader title={`${t('autopilot.funded')} (${p.funded.length})`} />
            {p.funded.length ? table(p.funded) : <EmptyState />}
          </Card>
          <Card className="mt-5">
            <CardHeader title={`${t('autopilot.deferred')} (${p.deferred.length})`} />
            {p.deferred.length ? table(p.deferred, true) : <EmptyState />}
          </Card>
        </>
      )}
    </div>
  );
}

export default function CashflowPage() {
  return <Guard permission="autopilot.read"><CashflowScreen /></Guard>;
}

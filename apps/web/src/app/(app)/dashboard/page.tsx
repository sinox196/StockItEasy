'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Boxes, CalendarClock, Coins, PackageX, ScanBarcode, ShoppingCart, Sparkles, TrendingUp, Truck, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MovementsBarChart, RankedBars, SalesAreaChart } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { KpiCard, PageHeader } from '@/components/ui/misc';
import { EmptyState, ErrorState, Num, Skeleton } from '@/components/ui/states';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

export default function DashboardPage() {
  const { t, money, num, pct, date } = useI18n();
  const { me, org, can } = useAuth();
  const [days, setDays] = useState(30);
  const [warehouseId, setWarehouseId] = useState('');
  const range = useMemo(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - days * 86400_000).toISOString(), to: to.toISOString(), warehouseId: warehouseId || undefined };
  }, [days, warehouseId]);

  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: api.warehouses.list, enabled: can('warehouses.read') });
  const summary = useQuery({ queryKey: ['dashboard', 'summary', range], queryFn: () => api.dashboard.summary(range) });
  const charts = useQuery({ queryKey: ['dashboard', 'charts', range], queryFn: () => api.dashboard.charts(range) });
  const recs = useQuery({ queryKey: ['autopilot', 'OPEN'], queryFn: () => api.autopilot.list('OPEN'), enabled: can('autopilot.read') });
  const currency = org?.currency ?? 'TND';
  const k = summary.data?.kpis;

  return (
    <div>
      <PageHeader
        title={t('dashboard.welcome', { name: me?.user.fullName.split(' ')[0] ?? '' })}
        description={t('dashboard.subtitle')}
        actions={
          <>
            {can('sales.create') && (
              <Button asChild variant="accent">
                <Link href="/pos"><ScanBarcode /> {t('dashboard.openPos')}</Link>
              </Button>
            )}
            {can('products.create') && (
              <Button asChild variant="secondary">
                <Link href="/products/new">{t('dashboard.addProduct')}</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label={t('common.filters')}>
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-auto" aria-label={t('dashboard.period')}>
          <option value={7}>{t('dashboard.last7')}</option>
          <option value={30}>{t('dashboard.last30')}</option>
          <option value={90}>{t('dashboard.last90')}</option>
        </Select>
        {warehouses.data && warehouses.data.length > 1 && (
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-auto" aria-label={t('common.warehouse')}>
            <option value="">{t('common.all')}</option>
            {warehouses.data.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        )}
      </div>

      {summary.error ? (
        <Card><ErrorState error={summary.error} onRetry={() => summary.refetch()} /></Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {!k
            ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-24" />)
            : (
              <>
                <KpiCard label={t('dashboard.stockValue')} value={<Num>{money(k.stockValue, currency)}</Num>} sub={`${k.activeProducts} ${t('dashboard.activeProducts').toLowerCase()}`} icon={<Coins />} />
                <KpiCard label={t('dashboard.quantityAvailable')} value={<Num>{num(k.quantityAvailable, 0)}</Num>} sub={`${t('dashboard.quantityReserved')}: ${num(k.quantityReserved, 0)}`} icon={<Boxes />} />
                <KpiCard label={t('dashboard.outOfStock')} value={<Num>{k.outOfStock}</Num>} icon={<PackageX />} tone={k.outOfStock ? 'danger' : 'success'} href="/products?stockState=OUT" />
                <KpiCard label={t('dashboard.lowStock')} value={<Num>{k.lowStock}</Num>} icon={<AlertTriangle />} tone={k.lowStock ? 'warning' : 'success'} href="/products?stockState=LOW" />
                <KpiCard label={t('dashboard.salesToday')} value={<Num>{money(k.salesToday, currency)}</Num>} sub={`${k.salesTodayCount} ${t('nav.sales').toLowerCase()}`} icon={<ShoppingCart />} tone="success" />
                <KpiCard label={t('dashboard.pendingPurchases')} value={<Num>{k.pendingPurchases}</Num>} sub={<Num>{money(k.pendingPurchasesValue, currency)}</Num>} icon={<Truck />} href="/purchases" />
                <KpiCard label={t('dashboard.revenue')} value={<Num>{money(k.revenue, currency)}</Num>} sub={`${k.salesCount} ${t('nav.sales').toLowerCase()}`} icon={<TrendingUp />} />
                <KpiCard label={t('dashboard.grossMargin')} value={<Num>{money(k.grossMargin, currency)}</Num>} sub={k.grossMarginRate ? pct(k.grossMarginRate) : '—'} icon={<TrendingUp />} tone="success" />
                <KpiCard label={t('dashboard.cogs')} value={<Num>{money(k.cogs, currency)}</Num>} icon={<Coins />} />
                <KpiCard label={t('dashboard.slowMovers')} value={<Num>{k.slowMovers}</Num>} sub={<Num>{money(k.slowMoversValue, currency)}</Num>} icon={<Boxes />} tone={k.slowMovers ? 'warning' : 'default'} href="/reports" />
                <KpiCard label={t('dashboard.expiringSoon')} value={<Num>{k.expiringSoon}</Num>} icon={<CalendarClock />} tone={k.expiringSoon ? 'warning' : 'default'} />
                <KpiCard label={t('dashboard.replenishmentBudget')} value={<Num>{money(k.replenishmentBudget, currency)}</Num>} sub={t('common.projection')} icon={<Wallet />} href="/cashflow" />
              </>
            )}
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t('dashboard.salesChart')} />
          <CardBody>{charts.isLoading ? <Skeleton className="h-64" /> : charts.data?.salesByDay.length ? <SalesAreaChart data={charts.data.salesByDay} /> : <EmptyState />}</CardBody>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.alerts')} actions={<Link href="/products?stockState=LOW" className="text-sm text-secondary hover:underline">{t('common.view')}</Link>} />
          <CardBody className="space-y-2">
            {!summary.data ? (
              <Skeleton className="h-40" />
            ) : summary.data.alerts.outOfStock.length + summary.data.alerts.lowStock.length + summary.data.alerts.expiring.length === 0 ? (
              <p className="rounded-lg bg-success-soft p-4 text-sm text-success">{t('dashboard.noAlerts')}</p>
            ) : (
              <>
                {summary.data.alerts.outOfStock.map((a) => (
                  <Link key={a.id} href={`/products/${a.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 hover:bg-muted">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{a.name}</span><Num className="text-xs text-muted-foreground">{a.sku}</Num></span>
                    <Badge tone="danger">{t('products.stateOUT')}</Badge>
                  </Link>
                ))}
                {summary.data.alerts.lowStock.map((a) => (
                  <Link key={a.id} href={`/products/${a.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 hover:bg-muted">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{a.name}</span><span className="text-xs text-muted-foreground"><Num>{num(a.available)}</Num> / <Num>{num(a.minStock)}</Num></span></span>
                    <Badge tone="warning">{t('products.stateLOW')}</Badge>
                  </Link>
                ))}
                {summary.data.alerts.expiring.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <span className="min-w-0 text-sm"><span className="block truncate font-medium">{l.product?.name}</span><span className="text-xs text-muted-foreground">{t('products.lotNumber')} <Num>{l.lotNumber}</Num></span></span>
                    <Badge tone="warning">{date(l.expiryDate)}</Badge>
                  </div>
                ))}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('dashboard.movementsChart')} />
          <CardBody>{charts.isLoading ? <Skeleton className="h-64" /> : charts.data?.movementsByDay.length ? <MovementsBarChart data={charts.data.movementsByDay} /> : <EmptyState />}</CardBody>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.topProducts')} />
          <CardBody>
            {charts.isLoading ? <Skeleton className="h-64" /> : charts.data?.topProducts.length ? (
              <RankedBars data={charts.data.topProducts.map((p) => ({ label: p.name, value: p.revenue }))} valueLabel={t('dashboard.revenue')} format={(v) => money(v, currency)} />
            ) : <EmptyState />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.stockByCategory')} />
          <CardBody>
            {charts.data?.stockByCategory.length ? (
              <RankedBars data={charts.data.stockByCategory.map((c) => ({ label: c.category ?? '—', value: c.value }))} valueLabel={t('dashboard.stockValue')} format={(v) => money(v, currency)} />
            ) : charts.isLoading ? <Skeleton className="h-48" /> : <EmptyState />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.valueByWarehouse')} />
          <CardBody>
            {charts.data?.valueByWarehouse.length ? (
              <RankedBars data={charts.data.valueByWarehouse.map((w) => ({ label: w.warehouse, value: w.value }))} valueLabel={t('dashboard.stockValue')} format={(v) => money(v, currency)} />
            ) : charts.isLoading ? <Skeleton className="h-48" /> : <EmptyState />}
          </CardBody>
        </Card>
      </div>

      {can('autopilot.read') && (
        <Card className="mt-5">
          <CardHeader
            title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-secondary" /> {t('dashboard.aiInsights')}</span>}
            actions={<Button asChild size="sm" variant="outline"><Link href="/autopilot">{t('common.view')} <ArrowRight className="rtl:rotate-180" /></Link></Button>}
          />
          <CardBody>
            {recs.isLoading ? <Skeleton className="h-24" /> : !recs.data?.items.length ? (
              <p className="text-sm text-muted-foreground">{t('autopilot.empty')}</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {recs.data.items.slice(0, 6).map((r) => (
                  <li key={r.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{r.product?.name}</p>
                      <Badge tone={r.priority === 'CRITICAL' ? 'danger' : r.priority === 'RECOMMENDED' ? 'warning' : 'neutral'}>{t(`autopilot.priority${r.priority}`)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{r.reasons[0] ? t(r.reasons[0].key, r.reasons[0].params) : ''}</p>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span>{t('autopilot.suggestedQty')}: <Num className="font-semibold">{num(r.suggestedQty)}</Num></span>
                      <Num className="font-semibold">{money(r.estimatedCost, currency)}</Num>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

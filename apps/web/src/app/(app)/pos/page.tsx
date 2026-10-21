'use client';

import type { ProductListItem, Sale } from '@stockiteasy/api-client';
import { newIdempotencyKey } from '@stockiteasy/api-client';
import { computeLine, d, sum } from '@stockiteasy/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, HandCoins, Minus, Plus, Printer, ScanBarcode, Split, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Guard } from '@/components/shell/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { EmptyState, Num, Skeleton } from '@/components/ui/states';
import { api, ApiError } from '@/lib/api';
import { useDebounced, useErrorToast } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

interface CartLine {
  productId: string;
  name: string;
  sku: string;
  unitPrice: string;
  taxRate: string;
  quantity: number;
  available: number;
  allowFraction: boolean;
}

type PayMode = 'CASH' | 'CARD' | 'MIXED' | 'CREDIT';
const WH_KEY = 'sie_pos_warehouse';

function PosScreen() {
  const { t, money, num } = useI18n();
  const { org, can } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const currency = org?.currency ?? 'TND';
  const scanRef = useRef<HTMLInputElement>(null);

  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: api.warehouses.list });
  const [warehouseId, setWarehouseId] = useState('');
  useEffect(() => {
    if (!warehouses.data?.length || warehouseId) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(WH_KEY);
    } catch {
      /* ignore */
    }
    setWarehouseId(warehouses.data.find((w) => w.id === saved)?.id ?? warehouses.data[0].id);
  }, [warehouses.data, warehouseId]);

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories.list });
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState('');
  const q = useDebounced(filter, 200);
  const products = useQuery({
    queryKey: ['pos-products', warehouseId, category, q],
    queryFn: () => api.products.list({ warehouseId, categoryId: category || undefined, search: q || undefined, status: 'ACTIVE', pageSize: 60, sort: 'name', order: 'asc' }),
    enabled: !!warehouseId,
  });
  const customers = useQuery({ queryKey: ['customers', 'pos'], queryFn: () => api.customers.list({ pageSize: 200 }), enabled: can('customers.read') });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [code, setCode] = useState('');
  const [payMode, setPayMode] = useState<PayMode | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  // One idempotency key per cart: a retried checkout (double tap, timeout) can never create two sales.
  const [checkoutKey, setCheckoutKey] = useState(newIdempotencyKey);

  const totals = useMemo(() => {
    const lines = cart.map((l) => computeLine({ quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate }));
    return {
      subtotal: sum(lines.map((l) => l.net)).toFixed(3),
      tax: sum(lines.map((l) => l.tax)).toFixed(3),
      total: sum(lines.map((l) => l.total)).toFixed(3),
      items: cart.reduce((a, l) => a + l.quantity, 0),
    };
  }, [cart]);

  const add = (p: Pick<ProductListItem, 'id' | 'name' | 'sku' | 'salePrice' | 'taxRate' | 'allowFractionalQty'>, available: number, qty = 1) => {
    setCart((c) => {
      const existing = c.find((l) => l.productId === p.id);
      const nextQty = (existing?.quantity ?? 0) + qty;
      if (nextQty > available) {
        toast.warning(t('pos.unavailable', { name: p.name, available: num(available) }));
        return c;
      }
      if (existing) return c.map((l) => (l.productId === p.id ? { ...l, quantity: nextQty, available } : l));
      return [...c, { productId: p.id, name: p.name, sku: p.sku, unitPrice: p.salePrice, taxRate: p.taxRate, quantity: qty, available, allowFraction: p.allowFractionalQty }];
    });
  };

  const addByCode = async (e?: FormEvent) => {
    e?.preventDefault();
    const value = code.trim();
    if (!value) return;
    setCode('');
    try {
      const r = await api.products.lookup(value, warehouseId);
      const available = Number(r.warehouseStock?.available ?? 0);
      add({ id: r.product.id, name: r.product.name, sku: r.product.sku, salePrice: r.product.salePrice, taxRate: r.product.taxRate, allowFractionalQty: r.product.allowFractionalQty }, available, Number(r.unitFactor) || 1);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') toast.error(t('pos.notFound', { code: value }));
      else onError(err);
    } finally {
      scanRef.current?.focus();
    }
  };

  const setQty = (id: string, qty: number) =>
    setCart((c) => c.flatMap((l) => (l.productId !== id ? [l] : qty <= 0 ? [] : [{ ...l, quantity: Math.min(qty, l.available) }])));

  const checkout = async (payments: { method: string; amount: string }[]) => {
    try {
      const sale = await api.sales.create(
        {
          warehouseId,
          customerId: customerId || null,
          channel: 'POS',
          lines: cart.map((l) => ({ productId: l.productId, quantity: String(l.quantity) })),
          payments,
        },
        checkoutKey,
      );
      setReceipt(sale);
      setCart([]);
      setCustomerId('');
      setPayMode(null);
      setCheckoutKey(newIdempotencyKey());
      toast.success(t('pos.saleDone', { number: sale.number }));
      void qc.invalidateQueries({ queryKey: ['pos-products'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
      <section aria-label={t('common.products')} className="min-w-0">
        <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
          <form onSubmit={addByCode} className="flex min-w-[260px] flex-1 gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={scanRef}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('pos.scanPlaceholder')}
                className="h-14 w-full rounded-xl border border-border bg-surface ps-11 text-base focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                dir="ltr"
                aria-label={t('pos.scanPlaceholder')}
                inputMode="search"
              />
            </div>
            <Button type="submit" size="touch" variant="secondary" className="h-14">{t('pos.addByCode')}</Button>
          </form>
          {warehouses.data && warehouses.data.length > 1 && (
            <Select
              className="h-14 w-auto"
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setCart([]);
                try {
                  localStorage.setItem(WH_KEY, e.target.value);
                } catch {
                  /* ignore */
                }
              }}
              aria-label={t('common.warehouse')}
            >
              {warehouses.data.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          )}
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setCategory('')} className={cn('min-h-touch shrink-0 rounded-full border px-4 text-sm font-semibold', !category ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface')}>{t('pos.allCategories')}</button>
          {categories.data?.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)} className={cn('min-h-touch shrink-0 rounded-full border px-4 text-sm font-semibold', category === c.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface')}>{c.name}</button>
          ))}
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('common.search')} className="min-h-touch w-40 shrink-0 rounded-full border border-border bg-surface px-4 text-sm" aria-label={t('common.search')} />
        </div>
        {products.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
        ) : !products.data?.items.length ? (
          <div className="card"><EmptyState /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {products.data.items.map((p) => {
              const available = Number(p.stock.available);
              const inCart = cart.find((l) => l.productId === p.id)?.quantity ?? 0;
              return (
                <button
                  key={p.id}
                  onClick={() => add(p, available)}
                  disabled={available <= 0}
                  className="card flex min-h-36 flex-col p-4 text-start transition active:scale-[0.98] enabled:hover:-translate-y-0.5 enabled:hover:shadow-md disabled:opacity-50"
                >
                  <span className="text-xs font-medium text-muted-foreground">{p.category?.name ?? ''}</span>
                  <span className="mt-1 line-clamp-2 font-semibold leading-snug">{p.name}</span>
                  <Num className="mt-1 text-[11px] text-muted-foreground">{p.sku}</Num>
                  <span className="mt-auto flex items-end justify-between gap-2 pt-3">
                    <Num className="text-lg font-bold text-secondary">{money(p.salePriceTtc, currency)}</Num>
                    <span className={cn('rounded-md px-2 py-1 text-xs font-semibold', available <= 0 ? 'bg-danger-soft text-danger' : p.stock.state === 'LOW' ? 'bg-warning-soft text-amber-700' : 'bg-muted')}>
                      {t('pos.stock', { qty: num(available - inCart) })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="card flex h-fit flex-col xl:sticky xl:top-20" aria-label={t('pos.cart')}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{t('pos.cart')} <Badge className="ms-1">{num(totals.items)}</Badge></h2>
          {cart.length > 0 && <Button variant="ghost" size="sm" onClick={() => setCart([])}><Trash2 /> {t('pos.clearCart')}</Button>}
        </div>
        <div className="max-h-[45vh] flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">{t('pos.emptyCart')}</p>
              <p className="mt-1">{t('pos.emptyCartHint')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {cart.map((l) => {
                const line = computeLine({ quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate });
                return (
                  <li key={l.productId} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-snug">{l.name}</span>
                      <Num className="text-sm font-semibold">{money(line.total.toFixed(3), currency)}</Num>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button size="icon" variant="outline" className="size-11" onClick={() => setQty(l.productId, l.quantity - 1)} aria-label="−"><Minus /></Button>
                      <input
                        className="h-11 w-16 rounded-lg border border-border bg-surface text-center font-semibold num"
                        value={l.quantity}
                        inputMode="decimal"
                        onChange={(e) => {
                          const v = Number(e.target.value.replace(',', '.'));
                          if (!Number.isNaN(v)) setQty(l.productId, l.allowFraction ? v : Math.floor(v));
                        }}
                        aria-label={t('common.quantity')}
                      />
                      <Button size="icon" variant="outline" className="size-11" onClick={() => setQty(l.productId, l.quantity + 1)} disabled={l.quantity >= l.available} aria-label="+"><Plus /></Button>
                      <Button size="icon" variant="ghost" className="ms-auto size-11 text-danger" onClick={() => setQty(l.productId, 0)} aria-label={t('common.delete')}><X /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="space-y-3 border-t border-border p-4">
          {can('customers.read') && (
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label={t('pos.selectCustomer')}>
              <option value="">{t('pos.walkInCustomer')}</option>
              {customers.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><dt>{t('common.subtotal')}</dt><dd><Num>{money(totals.subtotal, currency)}</Num></dd></div>
            <div className="flex justify-between text-muted-foreground"><dt>{t('common.tax')}</dt><dd><Num>{money(totals.tax, currency)}</Num></dd></div>
            <div className="flex justify-between text-xl font-bold"><dt>{t('common.totalTtc')}</dt><dd><Num>{money(totals.total, currency)}</Num></dd></div>
          </dl>
          <div className="grid grid-cols-2 gap-2">
            {([['CASH', Banknote, 'pos.cash', 'accent'], ['CARD', CreditCard, 'pos.card', 'secondary'], ['MIXED', Split, 'pos.mixed', 'outline'], ['CREDIT', HandCoins, 'pos.credit', 'outline']] as const).map(([m, Icon, label, variant]) => (
              <Button key={m} variant={variant} size="touch" className="h-16 flex-col gap-1 text-sm" disabled={!cart.length || (m === 'CREDIT' && !org)} onClick={() => setPayMode(m)}>
                <Icon className="!size-5" /> {t(label)}
              </Button>
            ))}
          </div>
        </div>
      </aside>

      <PaymentDialog mode={payMode} total={totals.total} customerId={customerId} onClose={() => setPayMode(null)} onPay={checkout} />
      <ReceiptDialog sale={receipt} onClose={() => { setReceipt(null); scanRef.current?.focus(); }} />
    </div>
  );
}

function PaymentDialog({ mode, total, customerId, onClose, onPay }: { mode: PayMode | null; total: string; customerId: string; onClose: () => void; onPay: (p: { method: string; amount: string }[]) => Promise<void> }) {
  const { t, money } = useI18n();
  const { org } = useAuth();
  const currency = org?.currency ?? 'TND';
  const [received, setReceived] = useState('');
  const [cashPart, setCashPart] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setReceived('');
    setCashPart('');
  }, [mode]);
  if (!mode) return null;
  const change = d(received || 0).minus(d(total));
  const cardPart = d(total).minus(d(cashPart || 0));
  const canPay =
    mode === 'CASH' ? d(received || 0).gte(d(total)) :
    mode === 'MIXED' ? d(cashPart || 0).gt(0) && cardPart.gt(0) :
    mode === 'CREDIT' ? !!customerId && d(cashPart || 0).lte(d(total)) : true;

  const pay = async () => {
    setBusy(true);
    try {
      if (mode === 'CASH') await onPay([{ method: 'CASH', amount: total }]);
      else if (mode === 'CARD') await onPay([{ method: 'CARD', amount: total }]);
      else if (mode === 'MIXED') await onPay([{ method: 'CASH', amount: d(cashPart).toFixed(3) }, { method: 'CARD', amount: cardPart.toFixed(3) }]);
      else {
        const upfront = d(cashPart || 0);
        await onPay([...(upfront.gt(0) ? [{ method: 'CASH', amount: upfront.toFixed(3) }] : []), { method: 'CREDIT', amount: d(total).minus(upfront).toFixed(3) }]);
      }
    } finally {
      setBusy(false);
    }
  };
  const quick = ['5', '10', '20', '50', '100'].filter((v) => d(v).gte(d(total)));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t(mode === 'CASH' ? 'pos.cash' : mode === 'CARD' ? 'pos.card' : mode === 'MIXED' ? 'pos.mixed' : 'pos.credit')}
      footer={<Button size="touch" className="w-full" loading={busy} disabled={!canPay} onClick={pay}>{t('pos.pay')} · {money(total, currency)}</Button>}
    >
      <p className="mb-4 text-center text-3xl font-bold"><Num>{money(total, currency)}</Num></p>
      {mode === 'CASH' && (
        <div className="space-y-3">
          <Field label={t('pos.amountReceived')} htmlFor="recv"><Input id="recv" autoFocus dir="ltr" inputMode="decimal" className="h-14 text-xl" value={received} onChange={(e) => setReceived(e.target.value.replace(',', '.'))} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setReceived(total)}>= {money(total, currency)}</Button>
            {quick.map((v) => <Button key={v} variant="outline" size="sm" onClick={() => setReceived(v)}>{v}</Button>)}
          </div>
          <p className="flex justify-between rounded-lg bg-muted p-3 text-lg font-semibold"><span>{t('pos.change')}</span><Num>{money(change.gt(0) ? change.toFixed(3) : '0', currency)}</Num></p>
        </div>
      )}
      {mode === 'MIXED' && (
        <div className="space-y-3">
          <Field label={t('pos.cashPart')} htmlFor="cashp"><Input id="cashp" autoFocus dir="ltr" inputMode="decimal" className="h-14 text-xl" value={cashPart} onChange={(e) => setCashPart(e.target.value.replace(',', '.'))} /></Field>
          <p className="flex justify-between rounded-lg bg-muted p-3 font-semibold"><span>{t('pos.cardPart')}</span><Num>{money(cardPart.gt(0) ? cardPart.toFixed(3) : '0', currency)}</Num></p>
        </div>
      )}
      {mode === 'CREDIT' && (
        <div className="space-y-3">
          {!customerId ? (
            <p className="rounded-lg bg-warning-soft p-3 text-sm text-amber-800 dark:text-warning">{t('pos.creditRequiresCustomer')}</p>
          ) : (
            <Field label={t('pos.cashPart')} htmlFor="upfront" hint={t('sales.due')}><Input id="upfront" dir="ltr" inputMode="decimal" value={cashPart} onChange={(e) => setCashPart(e.target.value.replace(',', '.'))} /></Field>
          )}
        </div>
      )}
      {mode === 'CARD' && <p className="text-center text-sm text-muted-foreground">{t('pos.card')}</p>}
    </Dialog>
  );
}

function ReceiptDialog({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { t, money, num, dateTime } = useI18n();
  const { org } = useAuth();
  if (!sale) return null;
  const currency = org?.currency ?? 'TND';
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={`${t('sales.receipt')} ${sale.number}`}
      footer={
        <>
          <Button variant="outline" onClick={() => window.print()}><Printer /> {t('pos.printReceipt')}</Button>
          <Button onClick={onClose}>{t('pos.newSale')}</Button>
        </>
      }
    >
      <div className="receipt space-y-2 text-sm">
        <p className="text-center font-bold">{org?.name}</p>
        <p className="text-center text-xs text-muted-foreground">{dateTime(sale.completedAt)} · <Num>{sale.number}</Num></p>
        <ul className="divide-y divide-border">
          {sale.lines?.map((l) => (
            <li key={l.id} className="flex justify-between gap-2 py-1.5">
              <span>{l.product?.name} × <Num>{num(l.quantity)}</Num></span>
              <Num>{money(l.lineTotal, currency)}</Num>
            </li>
          ))}
        </ul>
        <div className="space-y-0.5 border-t border-border pt-2">
          <p className="flex justify-between"><span>{t('common.subtotal')}</span><Num>{money(sale.subtotal, currency)}</Num></p>
          <p className="flex justify-between"><span>{t('common.tax')}</span><Num>{money(sale.taxTotal, currency)}</Num></p>
          <p className="flex justify-between text-base font-bold"><span>{t('common.totalTtc')}</span><Num>{money(sale.total, currency)}</Num></p>
          {sale.payments?.map((p) => <p key={p.id} className="flex justify-between text-muted-foreground"><span>{t(`settings.paymentMethodsList.${p.method}`)}</span><Num>{money(p.amount, currency)}</Num></p>)}
          {sale.due && Number(sale.due) > 0 && <p className="flex justify-between font-semibold text-danger"><span>{t('sales.due')}</span><Num>{money(sale.due, currency)}</Num></p>}
        </div>
      </div>
    </Dialog>
  );
}

export default function PosPage() {
  return (
    <Guard permission="sales.create">
      <PosScreen />
    </Guard>
  );
}

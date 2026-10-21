'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil, Printer, SlidersHorizontal, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AdjustDialog } from '@/components/products/adjust-dialog';
import { BarcodeSvg, printLabel } from '@/components/products/barcode-label';
import { StockBadge } from '@/components/products/stock-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm';
import { KpiCard, PageHeader, Pagination } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { reasonLabel } from '@/lib/utils';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, money, num, pct, date, dateTime } = useI18n();
  const { can, org } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [adjust, setAdjust] = useState<'adjust' | 'block' | null>(null);
  const [page, setPage] = useState(1);
  const labelRef = useRef<HTMLDivElement>(null);
  const currency = org?.currency ?? 'TND';

  const query = useQuery({ queryKey: ['products', id], queryFn: () => api.products.get(id) });
  const movements = useQuery({ queryKey: ['movements', { productId: id, page }], queryFn: () => api.inventory.movements({ productId: id, page, pageSize: 15 }), enabled: can('inventory.read') });
  const lots = useQuery({ queryKey: ['lots', id], queryFn: () => api.inventory.lots(id), enabled: query.data?.tracking === 'LOT' });

  return (
    <QueryState query={query}>
      {(p) => {
        const primary = p.barcodes.find((b) => b.isPrimary && !b.unitCode) ?? p.barcodes[0];
        return (
          <div>
            <PageHeader
              title={p.name}
              description={<span className="flex flex-wrap items-center gap-2"><Num>{p.sku}</Num>{p.category && <span>· {p.category.name}</span>}{p.brand && <span>· {p.brand}</span>}</span>}
              badge={
                <>
                  <StockBadge state={p.stock.state} />
                  {p.status !== 'ACTIVE' && <Badge>{t(`products.status${p.status}`)}</Badge>}
                  {p.isDemo && <Badge tone="demo">{t('app.demoBadge')}</Badge>}
                </>
              }
              actions={
                <>
                  {can('inventory.create') && <Button variant="outline" onClick={() => setAdjust('adjust')}><SlidersHorizontal /> {t('movements.newAdjustment')}</Button>}
                  {can('inventory.approve') && <Button variant="outline" onClick={() => setAdjust('block')}><ShieldAlert /> {t('movements.block')}</Button>}
                  {can('products.update') && <Button asChild variant="outline"><Link href={`/products/${p.id}/edit`}><Pencil /> {t('common.edit')}</Link></Button>}
                  {can('products.delete') && p.status !== 'ARCHIVED' && (
                    <ConfirmButton
                      variant="danger"
                      description={t('products.archiveConfirm')}
                      onConfirm={async () => {
                        try {
                          await api.products.archive(p.id);
                          await qc.invalidateQueries({ queryKey: ['products'] });
                          toast.success(t('common.saved'));
                          router.push('/products');
                        } catch (e) {
                          onError(e);
                        }
                      }}
                    >
                      <Archive /> {t('common.archive')}
                    </ConfirmButton>
                  )}
                </>
              }
            />

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <KpiCard label={t('products.available')} value={<Num>{num(p.stock.available)} {p.baseUnit}</Num>} />
              <KpiCard label={t('products.onHand')} value={<Num>{num(p.stock.onHand)}</Num>} />
              <KpiCard label={t('products.reserved')} value={<Num>{num(p.stock.reserved)}</Num>} />
              <KpiCard label={t('products.blocked')} value={<Num>{num(p.stock.blocked)}</Num>} tone={Number(p.stock.blocked) > 0 ? 'warning' : 'default'} />
              <KpiCard label={t('products.averageCost')} value={<Num>{money(p.averageCost, currency)}</Num>} sub={`${t('dashboard.stockValue')}: ${money(p.stockValue, currency)}`} />
              <KpiCard label={t('products.salePriceTtc')} value={<Num>{money(p.salePriceTtc, currency)}</Num>} sub={`${t('products.margin')}: ${p.marginRate ? pct(p.marginRate) : '—'}`} />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader title={t('products.stockByWarehouse')} />
                {p.balances.length === 0 ? (
                  <EmptyState />
                ) : (
                  <Table>
                    <THead><tr><Th>{t('common.warehouse')}</Th><Th className="text-end">{t('products.onHand')}</Th><Th className="text-end">{t('products.reserved')}</Th><Th className="text-end">{t('products.blocked')}</Th><Th className="text-end">{t('products.available')}</Th></tr></THead>
                    <TBody>
                      {p.balances.map((b) => (
                        <Tr key={b.id}>
                          <Td>{b.warehouse.name}</Td>
                          <Td className="text-end"><Num>{num(b.quantityOnHand)}</Num></Td>
                          <Td className="text-end"><Num>{num(b.quantityReserved)}</Num></Td>
                          <Td className="text-end"><Num>{num(b.quantityBlocked)}</Num></Td>
                          <Td className="text-end font-semibold"><Num>{num(Number(b.quantityOnHand) - Number(b.quantityReserved) - Number(b.quantityBlocked))}</Num></Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
              <Card>
                <CardHeader
                  title={t('products.labels')}
                  actions={primary && (
                    <Button size="sm" variant="outline" onClick={() => printLabel(p.name, money(p.salePriceTtc, currency), labelRef.current?.innerHTML ?? '')}>
                      <Printer /> {t('products.printLabel')}
                    </Button>
                  )}
                />
                <CardBody>
                  {primary ? (
                    <div ref={labelRef} className="flex justify-center rounded-lg bg-white p-2"><BarcodeSvg code={primary.code} /></div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('common.none')}</p>
                  )}
                  <ul className="mt-3 space-y-1 text-sm">
                    {p.barcodes.map((b) => (
                      <li key={b.id} className="flex justify-between"><Num>{b.code}</Num><span className="text-muted-foreground">{b.unitCode ?? p.baseUnit}</span></li>
                    ))}
                    {p.conversions.map((c) => (
                      <li key={c.id} className="flex justify-between text-muted-foreground"><span>1 {c.unitCode}</span><Num>= {num(c.factor)} {p.baseUnit}</Num></li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </div>

            {p.tracking === 'LOT' && (
              <Card className="mt-5">
                <CardHeader title={t('products.lots')} />
                {lots.data?.length ? (
                  <Table>
                    <THead><tr><Th>{t('products.lotNumber')}</Th><Th>{t('products.expiryDate')}</Th><Th className="text-end">{t('common.quantity')}</Th></tr></THead>
                    <TBody>{lots.data.map((l) => <Tr key={l.id}><Td><Num>{l.lotNumber}</Num></Td><Td>{date(l.expiryDate)}</Td><Td className="text-end"><Num>{num(l.quantity)}</Num></Td></Tr>)}</TBody>
                  </Table>
                ) : <EmptyState />}
              </Card>
            )}

            {p.supplierProducts.length > 0 && (
              <Card className="mt-5">
                <CardHeader title={t('nav.suppliers')} />
                <Table>
                  <THead><tr><Th>{t('common.supplier')}</Th><Th className="text-end">{t('suppliers.unitPrice')}</Th><Th className="text-end">{t('suppliers.moq')}</Th><Th className="text-end">{t('suppliers.leadTime')}</Th><Th /></tr></THead>
                  <TBody>
                    {p.supplierProducts.map((s) => (
                      <Tr key={s.id}>
                        <Td><Link href={`/suppliers/${s.supplierId}`} className="hover:underline">{s.supplier.name}</Link></Td>
                        <Td className="text-end"><Num>{money(s.unitPrice, currency)}</Num></Td>
                        <Td className="text-end"><Num>{s.minOrderQty ? num(s.minOrderQty) : '—'}</Num></Td>
                        <Td className="text-end"><Num>{s.leadTimeDays ?? '—'}</Num></Td>
                        <Td>{s.isPreferred && <Badge tone="info">{t('suppliers.preferred')}</Badge>}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </Card>
            )}

            {can('inventory.read') && (
              <Card className="mt-5">
                <CardHeader title={t('products.history')} />
                <QueryState query={movements} isEmpty={(d) => d.items.length === 0} empty={<EmptyState description={t('movements.empty')} />}>
                  {(m) => (
                    <>
                      <Table>
                        <THead><tr><Th>{t('common.date')}</Th><Th>{t('movements.type')}</Th><Th>{t('common.warehouse')}</Th><Th className="text-end">{t('common.quantity')}</Th><Th className="text-end">{t('movements.balanceAfter')}</Th><Th>{t('common.reason')}</Th><Th>{t('common.user')}</Th></tr></THead>
                        <TBody>
                          {m.items.map((mv) => (
                            <Tr key={mv.id}>
                              <Td className="whitespace-nowrap text-xs">{dateTime(mv.occurredAt)}</Td>
                              <Td>{t(`movements.types.${mv.type}`)}</Td>
                              <Td className="text-muted-foreground">{mv.warehouse?.name}</Td>
                              <Td className={`text-end font-semibold ${Number(mv.quantity) >= 0 ? 'text-success' : 'text-danger'}`}><Num>{Number(mv.quantity) > 0 ? '+' : ''}{num(mv.quantity)}</Num></Td>
                              <Td className="text-end"><Num>{num(mv.balanceAfter)}</Num></Td>
                              <Td className="text-xs text-muted-foreground">{reasonLabel(t, mv.reason) ?? mv.referenceType ?? '—'}{mv.note ? ` · ${mv.note}` : ''}</Td>
                              <Td className="text-xs text-muted-foreground">{mv.user?.fullName ?? '—'}</Td>
                            </Tr>
                          ))}
                        </TBody>
                      </Table>
                      <Pagination page={m.page} pageSize={m.pageSize} total={m.total} onPage={setPage} />
                    </>
                  )}
                </QueryState>
              </Card>
            )}

            <AdjustDialog open={adjust !== null} onOpenChange={(o) => !o && setAdjust(null)} productId={p.id} mode={adjust ?? 'adjust'} needsLot={p.tracking === 'LOT'} />
          </div>
        );
      }}
    </QueryState>
  );
}

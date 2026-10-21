'use client';

import type { ProductListItem } from '@stockiteasy/api-client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Papa from 'papaparse';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { StockBadge } from '@/components/products/stock-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { PageHeader, Pagination, SearchInput } from '@/components/ui/misc';
import { EmptyState, Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useDebounced, useErrorToast } from '@/lib/hooks';
import { downloadText } from '@/lib/utils';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [report, setReport] = useState<Awaited<ReturnType<typeof api.products.import>> | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (file: File) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        setRows(res.data);
        try {
          setReport(await api.products.import(res.data, true));
        } catch (e) {
          onError(e);
        }
      },
    });
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await api.products.import(rows, false);
      toast.success(t('products.imported', { count: (r.created ?? 0) + (r.updated ?? 0) }));
      await qc.invalidateQueries({ queryKey: ['products'] });
      onOpenChange(false);
      setRows([]);
      setReport(null);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('products.importTitle')}
      description={t('products.importHint')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={confirm} loading={busy} disabled={!report || !report.valid}>{t('products.importConfirm')}</Button>
        </>
      }
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-sm text-muted-foreground hover:border-secondary">
        <Upload className="size-6" />
        <span>CSV (UTF-8)</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      {report && (
        <div className="mt-4">
          <h4 className="mb-2 font-semibold">{t('products.importPreview')}</h4>
          <div className="mb-3 flex gap-2">
            <Badge tone="success">{t('products.importValid', { count: report.valid ?? 0 })}</Badge>
            <Badge tone={report.invalid ? 'danger' : 'neutral'}>{t('products.importInvalid', { count: report.invalid })}</Badge>
          </div>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
            {report.report.filter((r) => r.status === 'invalid').map((r) => (
              <li key={r.row} className="rounded bg-danger-soft px-2 py-1 text-danger">
                #{r.row} <Num>{r.sku}</Num> — {r.errors?.map((e) => `${e.path}: ${e.message.startsWith('validation.') ? t(e.message) : e.message}`).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}

function ProductsList() {
  const { t, money, num } = useI18n();
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState('');
  const [stockState, setStockState] = useState(params.get('stockState') ?? '');
  const [importOpen, setImportOpen] = useState(false);
  const q = useDebounced(search);
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories.list });
  const query = useQuery({
    queryKey: ['products', { q, page, categoryId, stockState }],
    queryFn: () => api.products.list({ search: q, page, pageSize: 25, categoryId: categoryId || undefined, stockState: stockState || undefined, sort: 'name', order: 'asc' }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title={t('products.title')}
        actions={
          <>
            {can('products.export') && (
              <Button variant="outline" onClick={async () => downloadText('products.csv', await api.products.exportCsv())}><Download /> {t('common.exportCsv')}</Button>
            )}
            {can('products.create') && (
              <>
                <Button variant="outline" onClick={() => setImportOpen(true)}><Upload /> {t('common.import')}</Button>
                <Button asChild><Link href="/products/new"><Plus /> {t('products.new')}</Link></Button>
              </>
            )}
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
          <Select className="w-auto" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} aria-label={t('common.category')}>
            <option value="">{t('common.category')}: {t('common.all')}</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select className="w-auto" value={stockState} onChange={(e) => { setStockState(e.target.value); setPage(1); }} aria-label={t('products.stockState')}>
            <option value="">{t('products.stockState')}: {t('common.all')}</option>
            <option value="OK">{t('products.stateOK')}</option>
            <option value="LOW">{t('products.stateLOW')}</option>
            <option value="OUT">{t('products.stateOUT')}</option>
          </Select>
        </div>
        <QueryState
          query={query}
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyState description={t('products.empty')} action={can('products.create') ? <Button asChild><Link href="/products/new">{t('products.new')}</Link></Button> : undefined} />}
        >
          {(data) => (
            <>
              <Table>
                <THead>
                  <tr>
                    <Th>{t('common.product')}</Th>
                    <Th>{t('products.sku')}</Th>
                    <Th>{t('common.category')}</Th>
                    <Th className="text-end">{t('products.available')}</Th>
                    <Th className="text-end">{t('products.salePriceTtc')}</Th>
                    <Th>{t('products.stockState')}</Th>
                  </tr>
                </THead>
                <TBody>
                  {data.items.map((p: ProductListItem) => (
                    <Tr key={p.id} className="cursor-pointer" onClick={() => router.push(`/products/${p.id}`)}>
                      <Td>
                        <Link href={`/products/${p.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                        {p.isDemo && <Badge tone="demo" className="ms-2">{t('app.demoBadge')}</Badge>}
                        {p.status !== 'ACTIVE' && <Badge className="ms-2">{t(`products.status${p.status}`)}</Badge>}
                        {p.barcode && <div className="text-xs text-muted-foreground"><Num>{p.barcode}</Num></div>}
                      </Td>
                      <Td><Num className="text-xs">{p.sku}</Num></Td>
                      <Td className="text-muted-foreground">{p.category?.name ?? '—'}</Td>
                      <Td className="text-end"><Num>{num(p.stock.available)}</Num> <span className="text-xs text-muted-foreground">{p.baseUnit}</span></Td>
                      <Td className="text-end"><Num>{money(p.salePriceTtc)}</Num></Td>
                      <Td><StockBadge state={p.stock.state} /></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

export default function ProductsPage() {
  return <Suspense><ProductsList /></Suspense>;
}

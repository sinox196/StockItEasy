'use client';

import type { Product } from '@stockiteasy/api-client';
import { createProductSchema, priceWithTax, PRODUCT_STATUSES, PRODUCT_TRACKING, updateProductSchema } from '@stockiteasy/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';
import { Num } from '@/components/ui/states';
import { api, ApiError } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useI18n } from '@/providers/i18n';

type Errors = Record<string, string>;

const blank = {
  name: '',
  sku: '',
  barcodes: '',
  generateBarcode: false,
  categoryId: '',
  brand: '',
  baseUnit: 'pc',
  allowFractionalQty: false,
  tracking: 'NONE',
  hasExpiry: false,
  purchasePrice: '0',
  salePrice: '0',
  minSalePrice: '',
  taxRate: '19',
  minStock: '0',
  maxStock: '',
  preferredSupplierId: '',
  status: 'ACTIVE',
  description: '',
  conversions: [] as { unitCode: string; factor: string; barcode: string }[],
  opening: { warehouseId: '', quantity: '', unitCost: '' },
};

export function ProductForm({ product }: { product?: Product }) {
  const { t, money } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [f, setF] = useState(() =>
    product
      ? {
          ...blank,
          name: product.name,
          sku: product.sku,
          barcodes: product.barcodes.filter((b) => !b.unitCode).map((b) => b.code).join(', '),
          categoryId: product.categoryId ?? '',
          brand: product.brand ?? '',
          baseUnit: product.baseUnit,
          allowFractionalQty: product.allowFractionalQty,
          tracking: product.tracking,
          hasExpiry: product.hasExpiry,
          purchasePrice: product.purchasePrice,
          salePrice: product.salePrice,
          minSalePrice: product.minSalePrice ?? '',
          taxRate: product.taxRate,
          minStock: product.minStock,
          maxStock: product.maxStock ?? '',
          preferredSupplierId: product.preferredSupplierId ?? '',
          status: product.status,
          description: product.description ?? '',
          conversions: product.conversions.map((c) => ({ unitCode: c.unitCode, factor: c.factor, barcode: product.barcodes.find((b) => b.unitCode === c.unitCode)?.code ?? '' })),
        }
      : blank,
  );
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories.list });
  const suppliers = useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => api.suppliers.list({ pageSize: 200 }) });
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: api.warehouses.list, enabled: !product });

  const payload = () => ({
    name: f.name,
    sku: f.sku,
    barcodes: f.barcodes.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
    generateBarcode: f.generateBarcode,
    categoryId: f.categoryId || null,
    brand: f.brand || null,
    baseUnit: f.baseUnit || 'pc',
    allowFractionalQty: f.allowFractionalQty,
    tracking: f.tracking,
    hasExpiry: f.hasExpiry,
    purchasePrice: f.purchasePrice || '0',
    salePrice: f.salePrice || '0',
    minSalePrice: f.minSalePrice || null,
    taxRate: f.taxRate || '0',
    minStock: f.minStock || '0',
    maxStock: f.maxStock || null,
    preferredSupplierId: f.preferredSupplierId || null,
    status: f.status,
    description: f.description || null,
    conversions: f.conversions.filter((c) => c.unitCode && c.factor).map((c) => ({ unitCode: c.unitCode, factor: c.factor, barcode: c.barcode || undefined })),
    ...(product
      ? { version: product.version }
      : f.opening.warehouseId && f.opening.quantity
        ? { openingStock: { warehouseId: f.opening.warehouseId, quantity: f.opening.quantity, unitCost: f.opening.unitCost || undefined } }
        : {}),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = payload();
    const parsed = (product ? updateProductSchema : createProductSchema).safeParse(body);
    if (!parsed.success) {
      const errs: Errors = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message.startsWith('validation.') ? t(i.message) : t('validation.required');
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const saved = product ? await api.products.update(product.id, body) : await api.products.create(body);
      await qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(t(product ? 'common.saved' : 'common.created'));
      router.push(`/products/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'SKU_TAKEN' || err.code === 'BARCODE_TAKEN')) setErrors({ [err.code === 'SKU_TAKEN' ? 'sku' : 'barcodes']: t(`errors.${err.code}`) });
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const ttc = (() => {
    try {
      return priceWithTax(f.salePrice || '0', f.taxRate || '0').toFixed(3);
    } catch {
      return '0';
    }
  })();
  const margin = Number(f.salePrice) > 0 ? ((Number(f.salePrice) - Number(f.purchasePrice)) / Number(f.salePrice)) * 100 : null;

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-3" noValidate>
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <CardHeader title={t('common.details')} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t('products.name')} htmlFor="name" error={errors.name} required className="sm:col-span-2">
              <Input id="name" value={f.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label={t('products.sku')} htmlFor="sku" error={errors.sku} required>
              <Input id="sku" dir="ltr" value={f.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} />
            </Field>
            <Field label={t('products.barcodes')} htmlFor="barcodes" error={errors.barcodes} hint="EAN-13 / UPC">
              <Input id="barcodes" dir="ltr" inputMode="numeric" value={f.barcodes} onChange={(e) => set('barcodes', e.target.value)} />
            </Field>
            {!product && (
              <Checkbox className="sm:col-span-2" label={t('products.generateBarcode')} checked={f.generateBarcode} onChange={(e) => set('generateBarcode', e.target.checked)} />
            )}
            <Field label={t('common.category')} htmlFor="cat">
              <Select id="cat" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">—</option>
                {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={t('products.brand')} htmlFor="brand"><Input id="brand" value={f.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
            <Field label={t('products.description')} htmlFor="desc" className="sm:col-span-2"><Textarea id="desc" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('common.price')} />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Field label={t('products.purchasePrice')} htmlFor="pp" error={errors.purchasePrice}><Input id="pp" dir="ltr" inputMode="decimal" value={f.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)} /></Field>
            <Field label={t('products.salePrice')} htmlFor="sp" error={errors.salePrice}><Input id="sp" dir="ltr" inputMode="decimal" value={f.salePrice} onChange={(e) => set('salePrice', e.target.value)} /></Field>
            <Field label={t('products.taxRate')} htmlFor="tax" error={errors.taxRate}>
              <Select id="tax" value={f.taxRate} onChange={(e) => set('taxRate', e.target.value)}>
                {['19', '13', '7', '0'].map((r) => <option key={r} value={r}>{r} %</option>)}
                {!['19', '13', '7', '0'].includes(String(Number(f.taxRate))) && <option value={f.taxRate}>{f.taxRate} %</option>}
              </Select>
            </Field>
            <Field label={t('products.minSalePrice')} htmlFor="msp" error={errors.minSalePrice}><Input id="msp" dir="ltr" inputMode="decimal" value={f.minSalePrice} onChange={(e) => set('minSalePrice', e.target.value)} /></Field>
            <div className="rounded-lg bg-muted p-3 text-sm sm:col-span-2">
              <p>{t('products.salePriceTtc')}: <Num className="font-semibold">{money(ttc)}</Num></p>
              <p className="text-muted-foreground">{t('products.margin')}: <Num>{margin === null ? '—' : `${margin.toFixed(1)} %`}</Num></p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t('products.conversions')}
            actions={<Button type="button" size="sm" variant="outline" onClick={() => set('conversions', [...f.conversions, { unitCode: '', factor: '', barcode: '' }])}><Plus /> {t('common.add')}</Button>}
          />
          <CardBody className="space-y-3">
            {f.conversions.length === 0 && <p className="text-sm text-muted-foreground">{t('common.none')}</p>}
            {f.conversions.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-end gap-2">
                <Field label={t('products.packUnit')} htmlFor={`cu${i}`}><Input id={`cu${i}`} placeholder="carton" value={c.unitCode} onChange={(e) => set('conversions', f.conversions.map((x, j) => (j === i ? { ...x, unitCode: e.target.value } : x)))} /></Field>
                <Field label={t('products.conversionFactor')} htmlFor={`cf${i}`}><Input id={`cf${i}`} dir="ltr" inputMode="decimal" value={c.factor} onChange={(e) => set('conversions', f.conversions.map((x, j) => (j === i ? { ...x, factor: e.target.value } : x)))} /></Field>
                <Field label={t('products.barcode')} htmlFor={`cb${i}`}><Input id={`cb${i}`} dir="ltr" value={c.barcode} onChange={(e) => set('conversions', f.conversions.map((x, j) => (j === i ? { ...x, barcode: e.target.value } : x)))} /></Field>
                <Button type="button" variant="ghost" size="icon" aria-label={t('common.removeLine')} onClick={() => set('conversions', f.conversions.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title={t('nav.inventory')} />
          <CardBody className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('products.baseUnit')} htmlFor="unit"><Input id="unit" value={f.baseUnit} onChange={(e) => set('baseUnit', e.target.value)} /></Field>
              <Field label={t('products.status')} htmlFor="status">
                <Select id="status" value={f.status} onChange={(e) => set('status', e.target.value)}>
                  {PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{t(`products.status${s}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('products.minStock')} htmlFor="min" error={errors.minStock}><Input id="min" dir="ltr" inputMode="decimal" value={f.minStock} onChange={(e) => set('minStock', e.target.value)} /></Field>
              <Field label={t('products.maxStock')} htmlFor="max" error={errors.maxStock}><Input id="max" dir="ltr" inputMode="decimal" value={f.maxStock} onChange={(e) => set('maxStock', e.target.value)} /></Field>
            </div>
            <Checkbox label={t('products.allowFractional')} checked={f.allowFractionalQty} onChange={(e) => set('allowFractionalQty', e.target.checked)} />
            <Field label={t('products.tracking')} htmlFor="tracking">
              <Select id="tracking" value={f.hasExpiry ? 'LOT' : f.tracking} disabled={f.hasExpiry} onChange={(e) => set('tracking', e.target.value)}>
                {PRODUCT_TRACKING.map((s) => <option key={s} value={s}>{t(`products.tracking${s}`)}</option>)}
              </Select>
            </Field>
            <Checkbox label={t('products.hasExpiry')} checked={f.hasExpiry} onChange={(e) => set('hasExpiry', e.target.checked)} />
            <Field label={t('products.preferredSupplier')} htmlFor="sup">
              <Select id="sup" value={f.preferredSupplierId} onChange={(e) => set('preferredSupplierId', e.target.value)}>
                <option value="">—</option>
                {suppliers.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </CardBody>
        </Card>

        {!product && (
          <Card>
            <CardHeader title={t('products.openingStock')} />
            <CardBody className="grid gap-3">
              <Field label={t('products.openingWarehouse')} htmlFor="ow">
                <Select id="ow" value={f.opening.warehouseId} onChange={(e) => set('opening', { ...f.opening, warehouseId: e.target.value })}>
                  <option value="">—</option>
                  {warehouses.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('common.quantity')} htmlFor="oq"><Input id="oq" dir="ltr" inputMode="decimal" value={f.opening.quantity} onChange={(e) => set('opening', { ...f.opening, quantity: e.target.value })} /></Field>
                <Field label={t('movements.unitCost')} htmlFor="oc"><Input id="oc" dir="ltr" inputMode="decimal" placeholder={f.purchasePrice} value={f.opening.unitCost} onChange={(e) => set('opening', { ...f.opening, unitCost: e.target.value })} /></Field>
              </div>
            </CardBody>
          </Card>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>{t('common.cancel')}</Button>
          <Button type="submit" className="flex-1" loading={busy}>{t('common.save')}</Button>
        </div>
      </div>
    </form>
  );
}

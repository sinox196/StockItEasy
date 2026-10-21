'use client';

import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { ProductForm } from '@/components/products/product-form';
import { Guard } from '@/components/shell/require-auth';
import { PageHeader } from '@/components/ui/misc';
import { QueryState } from '@/components/ui/states';
import { api } from '@/lib/api';
import { useI18n } from '@/providers/i18n';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const query = useQuery({ queryKey: ['products', id], queryFn: () => api.products.get(id) });
  return (
    <Guard permission="products.update">
      <PageHeader title={t('products.edit')} />
      <QueryState query={query}>{(p) => <ProductForm product={p} />}</QueryState>
    </Guard>
  );
}

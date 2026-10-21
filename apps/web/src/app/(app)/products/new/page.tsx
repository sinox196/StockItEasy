'use client';

import { ProductForm } from '@/components/products/product-form';
import { Guard } from '@/components/shell/require-auth';
import { PageHeader } from '@/components/ui/misc';
import { useI18n } from '@/providers/i18n';

export default function NewProductPage() {
  const { t } = useI18n();
  return (
    <Guard permission="products.create">
      <PageHeader title={t('products.new')} />
      <ProductForm />
    </Guard>
  );
}

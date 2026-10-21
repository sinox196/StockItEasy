'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/providers/i18n';

export function StockBadge({ state }: { state: 'OK' | 'LOW' | 'OUT' }) {
  const { t } = useI18n();
  return <Badge tone={state === 'OK' ? 'success' : state === 'LOW' ? 'warning' : 'danger'}>{t(`products.state${state}`)}</Badge>;
}

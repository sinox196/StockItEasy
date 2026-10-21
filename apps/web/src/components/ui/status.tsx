'use client';

import { Badge } from './badge';
import { useI18n } from '@/providers/i18n';

const TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  DRAFT: 'neutral', IN_TRANSIT: 'info', RECEIVED: 'success', CANCELLED: 'danger',
  IN_PROGRESS: 'info', VALIDATED: 'success',
  PENDING_APPROVAL: 'warning', APPROVED: 'info', SENT: 'info', PARTIALLY_RECEIVED: 'warning',
  COMPLETED: 'success', PARTIALLY_RETURNED: 'warning', RETURNED: 'neutral',
  UNPAID: 'danger', PARTIAL: 'warning', PAID: 'success',
};

/** Status badge for a document; `ns` is the translation namespace holding `<ns>.<STATUS>`. */
export function StatusBadge({ ns, status }: { ns: string; status: string }) {
  const { t } = useI18n();
  return <Badge tone={TONES[status] ?? 'neutral'}>{t(`${ns}.${status}`)}</Badge>;
}

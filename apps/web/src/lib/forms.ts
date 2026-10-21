'use client';

import { useI18n } from '@/providers/i18n';

/** Translates zod issue messages (which are i18n keys such as "validation.email"). */
export function useFieldError() {
  const { t } = useI18n();
  return (msg?: string) => {
    if (!msg) return undefined;
    return msg.startsWith('validation.') ? t(msg) : t('validation.required');
  };
}

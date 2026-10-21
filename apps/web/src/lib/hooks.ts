'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from './api';
import { useI18n } from '@/providers/i18n';

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Shows a translated toast for an API error (code → errors.<code>). */
export function useErrorToast() {
  const { te, t } = useI18n();
  return (e: unknown) => {
    if (e instanceof ApiError) {
      const details = e.details as { available?: string; name?: string } | undefined;
      toast.error(te(e.code), { description: details?.available !== undefined ? `${details.name ?? ''} ${t('products.available')}: ${details.available}` : undefined });
    } else toast.error(te('UNKNOWN'));
  };
}

'use client';

import type { ProductListItem } from '@stockiteasy/api-client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Num } from '@/components/ui/states';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { useI18n } from '@/providers/i18n';

/** Search-as-you-type product selector (name, SKU or exact barcode). */
export function ProductPicker({ onPick, warehouseId, placeholder }: { onPick: (p: ProductListItem) => void; warehouseId?: string; placeholder?: string }) {
  const { t, num } = useI18n();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const q = useDebounced(search, 200);
  const results = useQuery({ queryKey: ['products', 'picker', q, warehouseId], queryFn: () => api.products.list({ search: q, pageSize: 8, warehouseId }), enabled: q.length >= 1 });
  return (
    <div className="relative">
      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.data?.items.length === 1) {
            e.preventDefault();
            onPick(results.data.items[0]);
            setSearch('');
          }
        }}
        placeholder={placeholder ?? t('common.searchPlaceholder')}
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
        aria-label={t('common.product')}
      />
      {open && q && results.data && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg" role="listbox">
          {results.data.items.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t('common.noResults')}</li>}
          {results.data.items.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(p); setSearch(''); setOpen(false); }}
              >
                <span><span className="font-medium">{p.name}</span> <Num className="text-xs text-muted-foreground">{p.sku}</Num></span>
                <Num className="text-xs text-muted-foreground">{num(p.stock.available)} {p.baseUnit}</Num>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

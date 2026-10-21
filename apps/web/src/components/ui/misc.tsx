'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n';
import { Button } from './button';

export function PageHeader({ title, description, actions, badge }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KpiCard({ label, value, sub, icon, tone = 'default', href }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'default' | 'danger' | 'warning' | 'success'; href?: string }) {
  const toneCls = { default: 'text-secondary bg-info-soft', danger: 'text-danger bg-danger-soft', warning: 'text-amber-600 bg-warning-soft', success: 'text-success bg-success-soft' }[tone];
  const content = (
    <div className="card flex h-full items-start gap-3 p-4 transition-shadow hover:shadow-md">
      {icon && <div className={cn('rounded-lg p-2 [&_svg]:size-5', toneCls)}>{icon}</div>}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 whitespace-nowrap text-xl font-bold tracking-tight">{value}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
  return href ? <a href={href}>{content}</a> : content;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <div className="px-4 py-3 text-xs text-muted-foreground">{t('common.results', { count: total })}</div>;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
      <span className="text-muted-foreground">{t('common.results', { count: total })}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('common.previous')}>
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <span className="text-muted-foreground">{t('common.pageOf', { page, pages })}</span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('common.next')}>
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}

export function TabsBar({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: { value: string; label: ReactNode }[] }) {
  return (
    <Tabs.Root value={value} onValueChange={onChange}>
      <Tabs.List className="mb-4 inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {items.map((i) => (
          <Tabs.Trigger
            key={i.value}
            value={i.value}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            {i.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const { t } = useI18n();
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? t('common.searchPlaceholder')}
      className={cn('h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25 sm:w-72', className)}
      aria-label={t('common.search')}
    />
  );
}

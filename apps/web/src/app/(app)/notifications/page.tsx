'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, Pagination } from '@/components/ui/misc';
import { EmptyState, QueryState } from '@/components/ui/states';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n';

export default function NotificationsPage() {
  const { t, dateTime, num, money } = useI18n();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['notifications', page], queryFn: () => api.notifications.list({ page }) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: ['notifications-unread'] });
  };
  const fmt = (params: Record<string, string | number>) =>
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, k === 'available' || k === 'min' ? num(v) : k === 'total' ? money(v) : k === 'date' ? dateTime(String(v)) : v]));
  return (
    <div>
      <PageHeader title={t('notifications.title')} actions={<Button variant="outline" onClick={async () => { await api.notifications.readAll(); refresh(); }}><CheckCheck /> {t('notifications.markAllRead')}</Button>} />
      <Card>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState description={t('notifications.empty')} />}>
          {(data) => (
            <>
              <ul className="divide-y divide-border">
                {data.items.map((n) => (
                  <li key={n.id} className={cn('flex items-start gap-3 px-5 py-4', !n.readAt && 'bg-info-soft/40')}>
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-secondary')} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{t(`notifications.${n.type}`, fmt(n.params))}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{dateTime(n.createdAt)}</p>
                    </div>
                    {n.link && (
                      <Link href={n.link} onClick={async () => { await api.notifications.read(n.id); refresh(); }} className="text-sm text-secondary hover:underline">{t('common.open')}</Link>
                    )}
                  </li>
                ))}
              </ul>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  );
}

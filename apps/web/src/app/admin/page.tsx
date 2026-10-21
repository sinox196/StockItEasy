'use client';

import { PLANS } from '@stockiteasy/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { KpiCard, PageHeader, Pagination, SearchInput } from '@/components/ui/misc';
import { Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useDebounced, useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

/** SaaS super-admin console (only for users flagged isSuperAdmin; enforced by the API). */
export default function AdminPage() {
  const { t, date } = useI18n();
  const { me } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const enabled = !!me?.user.isSuperAdmin;
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: api.admin.stats, enabled });
  const orgs = useQuery({ queryKey: ['admin', 'orgs', q, page], queryFn: () => api.admin.organizations({ search: q, page }), enabled });
  if (!enabled) return <div className="card p-10 text-center text-sm text-muted-foreground">{t('errors.FORBIDDEN')}</div>;
  return (
    <div>
      <PageHeader title={t('admin.title')} />
      {stats.data && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label={t('admin.organizations')} value={<Num>{stats.data.organizations}</Num>} />
          <KpiCard label={t('admin.users')} value={<Num>{stats.data.users}</Num>} />
          <KpiCard label={t('common.products')} value={<Num>{stats.data.products}</Num>} />
          <KpiCard label={t('nav.sales')} value={<Num>{stats.data.sales}</Num>} />
        </div>
      )}
      <Card>
        <div className="border-b border-border p-3"><SearchInput value={search} onChange={setSearch} placeholder={t('common.search')} /></div>
        <QueryState query={orgs}>
          {(data) => (
            <>
              <Table>
                <THead><tr><Th>{t('common.name')}</Th><Th>{t('onboarding.sector')}</Th><Th>{t('common.createdAt')}</Th><Th className="text-end">{t('settings.quotaUsers')}</Th><Th className="text-end">{t('settings.quotaProducts')}</Th><Th>{t('settings.currentPlan')}</Th></tr></THead>
                <TBody>
                  {data.items.map((o) => (
                    <Tr key={o.id}>
                      <Td className="font-medium">{o.name}</Td>
                      <Td className="text-xs">{t(`sectors.${o.sector}`)}</Td>
                      <Td className="text-xs">{date((o as unknown as { createdAt: string }).createdAt)}</Td>
                      <Td className="text-end"><Num>{o._count.members}</Num></Td>
                      <Td className="text-end"><Num>{o._count.products}</Num></Td>
                      <Td>
                        <Select className="h-9 w-auto" value={o.subscription?.plan ?? 'STARTER'} onChange={async (e) => { try { await api.admin.setPlan(o.id, e.target.value); toast.success(t('common.saved')); await qc.invalidateQueries({ queryKey: ['admin'] }); } catch (err) { onError(err); } }} aria-label={t('settings.currentPlan')}>
                          {PLANS.map((p) => <option key={p} value={p}>{t(`plans.${p}`)}</option>)}
                        </Select>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  );
}

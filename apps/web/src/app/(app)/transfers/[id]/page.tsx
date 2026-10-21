'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { use, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { Num, QueryState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

export default function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, num, dateTime } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const query = useQuery({ queryKey: ['transfers', id], queryFn: () => api.transfers.get(id) });
  const [received, setReceived] = useState<Record<string, string>>({});
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      await qc.invalidateQueries({ queryKey: ['transfers'] });
    } catch (e) {
      onError(e);
    }
  };
  return (
    <QueryState query={query}>
      {(tr) => (
        <div>
          <PageHeader
            title={<Num>{tr.number}</Num>}
            badge={<StatusBadge ns="transfers.statuses" status={tr.status} />}
            description={`${tr.from?.name} → ${tr.to?.name}`}
            actions={
              <>
                {tr.status === 'DRAFT' && can('transfers.update') && <ConfirmButton onConfirm={() => run(() => api.transfers.ship(id), t('transfers.shipped'))}>{t('transfers.ship')}</ConfirmButton>}
                {tr.status === 'IN_TRANSIT' && can('transfers.update') && (
                  <ConfirmButton variant="accent" onConfirm={() => run(() => api.transfers.receive(id, { lines: tr.lines!.map((l) => ({ lineId: l.id, quantityReceived: received[l.id] ?? l.quantity })) }), t('transfers.received'))}>
                    {t('transfers.receive')}
                  </ConfirmButton>
                )}
                {(tr.status === 'DRAFT' || tr.status === 'IN_TRANSIT') && can('transfers.approve') && (
                  <ConfirmButton variant="danger" description={t('transfers.cancelConfirm')} onConfirm={() => run(() => api.transfers.cancel(id), t('common.saved'))}>{t('common.cancel')}</ConfirmButton>
                )}
              </>
            }
          />
          <Card>
            <Table>
              <THead><tr><Th>{t('common.product')}</Th><Th className="text-end">{t('transfers.quantitySent')}</Th><Th className="text-end">{t('transfers.quantityReceived')}</Th><Th className="text-end">{t('transfers.discrepancy')}</Th></tr></THead>
              <TBody>
                {tr.lines?.map((l) => {
                  const rec = l.quantityReceived ?? received[l.id] ?? l.quantity;
                  const diff = Number(l.quantity) - Number(rec);
                  return (
                    <Tr key={l.id}>
                      <Td>{l.product?.name} <Num className="text-xs text-muted-foreground">{l.product?.sku}</Num></Td>
                      <Td className="text-end"><Num>{num(l.quantity)}</Num></Td>
                      <Td className="text-end">
                        {tr.status === 'IN_TRANSIT' ? (
                          <Input className="ms-auto w-24 text-end" dir="ltr" inputMode="decimal" value={received[l.id] ?? l.quantity} onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })} aria-label={t('transfers.quantityReceived')} />
                        ) : <Num>{l.quantityReceived ? num(l.quantityReceived) : '—'}</Num>}
                      </Td>
                      <Td className={`text-end ${diff ? 'font-semibold text-danger' : ''}`}><Num>{diff ? num(-diff) : '—'}</Num></Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
            <CardBody className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
              <span>{t('common.createdAt')}: {dateTime(tr.createdAt)}</span>
              {tr.shippedAt && <span>{t('transfers.statuses.IN_TRANSIT')}: {dateTime(tr.shippedAt)}</span>}
              {tr.receivedAt && <span>{t('transfers.statuses.RECEIVED')}: {dateTime(tr.receivedAt)}</span>}
              {tr.note && <span className="sm:col-span-3">{t('common.note')}: {tr.note}</span>}
            </CardBody>
          </Card>
        </div>
      )}
    </QueryState>
  );
}

'use client';

import { passwordSchema } from '@stockiteasy/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

export default function ProfilePage() {
  const { t, dateTime } = useI18n();
  const { me, reload } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.auth.sessions });
  const [fullName, setFullName] = useState(me?.user.fullName ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwError, setPwError] = useState<string>();

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.me.update({ fullName });
      await reload();
      toast.success(t('common.saved'));
    } catch (err) {
      onError(err);
    }
  };
  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(pw.next);
    if (!parsed.success) return setPwError(t(parsed.error.issues[0].message));
    setPwError(undefined);
    try {
      await api.auth.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '' });
      await qc.invalidateQueries({ queryKey: ['sessions'] });
      toast.success(t('common.saved'));
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div>
      <PageHeader title={t('common.profile')} description={me?.user.email} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('common.profile')} />
          <CardBody>
            <form onSubmit={saveProfile} className="flex items-end gap-2">
              <Field label={t('auth.fullName')} htmlFor="fn" className="flex-1"><Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
              <Button type="submit">{t('common.save')}</Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('auth.changePassword')} />
          <CardBody>
            <form onSubmit={changePw} className="grid gap-3 sm:grid-cols-2">
              <Field label={t('auth.currentPassword')} htmlFor="cp"><Input id="cp" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
              <Field label={t('auth.newPassword')} htmlFor="np" error={pwError} hint={t('auth.passwordHint')}><Input id="np" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
              <div><Button type="submit" disabled={!pw.current || !pw.next}>{t('common.save')}</Button></div>
            </form>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader title={t('auth.sessions')} />
        <QueryState query={sessions}>
          {(list) => (
            <Table>
              <THead><tr><Th>{t('common.details')}</Th><Th>IP</Th><Th>{t('common.createdAt')}</Th><Th /></tr></THead>
              <TBody>
                {list.map((s) => (
                  <Tr key={s.id}>
                    <Td><span className="text-sm">{s.deviceName ?? s.client}</span> {s.current && <Badge tone="success">{t('auth.currentSession')}</Badge>}<div className="max-w-md truncate text-xs text-muted-foreground">{s.userAgent}</div></Td>
                    <Td><Num>{s.ip ?? '—'}</Num></Td>
                    <Td className="text-xs">{dateTime(s.createdAt)}</Td>
                    <Td className="text-end">{!s.current && <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await api.auth.revokeSession(s.id); await qc.invalidateQueries({ queryKey: ['sessions'] }); }}>{t('auth.revoke')}</Button>}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </QueryState>
      </Card>
    </div>
  );
}

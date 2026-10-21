'use client';

import type { Role } from '@stockiteasy/api-client';
import { MODULE_ACTIONS, PERMISSION_ACTIONS, PERMISSION_MODULES } from '@stockiteasy/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Guard } from '@/components/shell/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { PageHeader, TabsBar } from '@/components/ui/misc';
import { Num, QueryState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useErrorToast } from '@/lib/hooks';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';

function roleLabel(t: (k: string) => string, r: { key: string | null; name: string }) {
  return r.key ? t(`roles.${r.key}`) : r.name;
}

function PermissionMatrix({ roles }: { roles: Role[] }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
  const role = roles.find((r) => r.id === roleId);
  const [perms, setPerms] = useState<string[]>(role?.permissions ?? []);
  const [name, setName] = useState('');
  useEffect(() => setPerms(role?.permissions ?? []), [role]);
  const locked = role?.key === 'OWNER' || !can('users.update');
  const toggle = (p: string) => setPerms((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));
  const save = async () => {
    if (!role) return;
    try {
      await api.organizations.updateRole(role.id, { name: role.name, permissions: perms });
      await qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success(t('common.saved'));
    } catch (e) {
      onError(e);
    }
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.organizations.createRole({ name, permissions: [] });
      await qc.invalidateQueries({ queryKey: ['roles'] });
      setRoleId(r.id);
      setName('');
    } catch (err) {
      onError(err);
    }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Select className="w-auto" value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label={t('users.role')}>
          {roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(t, r)}</option>)}
        </Select>
        {role?.isSystem && <Badge>{t('users.systemRole')}</Badge>}
        {!locked && <Button size="sm" onClick={save}>{t('common.save')}</Button>}
        {role && !role.isSystem && role._count.members === 0 && can('users.delete') && (
          <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { try { await api.organizations.deleteRole(role.id); await qc.invalidateQueries({ queryKey: ['roles'] }); setRoleId(roles[0].id); } catch (e) { onError(e); } }}><Trash2 /></Button>
        )}
        {can('users.update') && (
          <form onSubmit={create} className="ms-auto flex gap-2">
            <Input className="w-44" placeholder={t('users.newRole')} value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
            <Button size="sm" variant="outline" type="submit"><Plus /></Button>
          </form>
        )}
      </div>
      {role?.key === 'OWNER' && <p className="px-4 pt-3 text-xs text-muted-foreground">{t('users.ownerLocked')}</p>}
      <Table>
        <THead><tr><Th>{t('users.permissions')}</Th>{PERMISSION_ACTIONS.map((a) => <Th key={a} className="text-center">{t(`permissions.actions.${a}`)}</Th>)}</tr></THead>
        <TBody>
          {PERMISSION_MODULES.map((m) => (
            <Tr key={m}>
              <Td className="font-medium">{t(`permissions.modules.${m}`)}</Td>
              {PERMISSION_ACTIONS.map((a) => {
                const p = `${m}.${a}`;
                const applicable = MODULE_ACTIONS[m].includes(a);
                return (
                  <Td key={a} className="text-center">
                    {applicable ? <input type="checkbox" className="size-4 accent-[rgb(var(--secondary))]" checked={perms.includes(p)} disabled={locked} onChange={() => toggle(p)} aria-label={`${m} ${a}`} /> : <span className="text-muted-foreground/40">·</span>}
                  </Td>
                );
              })}
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function UsersScreen() {
  const { t, dateTime } = useI18n();
  const { can, me } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [tab, setTab] = useState('members');
  const members = useQuery({ queryKey: ['members'], queryFn: api.organizations.members });
  const roles = useQuery({ queryKey: ['roles'], queryFn: api.organizations.roles });
  const [invite, setInvite] = useState<{ email: string; roleId: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['members'] });
  return (
    <div>
      <PageHeader title={t('users.title')} actions={can('users.create') && <Button onClick={() => setInvite({ email: '', roleId: roles.data?.find((r) => r.key === 'EMPLOYEE')?.id ?? '' })}><Mail /> {t('users.invite')}</Button>} />
      <TabsBar value={tab} onChange={setTab} items={[{ value: 'members', label: t('users.members') }, { value: 'roles', label: t('users.permissions') }]} />
      {tab === 'members' ? (
        <QueryState query={members}>
          {(d) => (
            <>
              <Card>
                <Table>
                  <THead><tr><Th>{t('common.name')}</Th><Th>{t('auth.email')}</Th><Th>{t('users.role')}</Th><Th>{t('common.lastUpdate')}</Th><Th>{t('users.status')}</Th><Th /></tr></THead>
                  <TBody>
                    {d.members.map((m) => (
                      <Tr key={m.id}>
                        <Td className="font-medium">{m.user.fullName}</Td>
                        <Td><Num>{m.user.email}</Num></Td>
                        <Td>
                          {can('users.update') && m.userId !== me?.user.id ? (
                            <Select className="h-9 w-auto" value={m.role.id} onChange={async (e) => { try { await api.organizations.updateMember(m.id, { roleId: e.target.value }); await refresh(); } catch (err) { onError(err); } }} aria-label={t('users.role')}>
                              {roles.data?.map((r) => <option key={r.id} value={r.id}>{roleLabel(t, r)}</option>)}
                            </Select>
                          ) : roleLabel(t, m.role)}
                        </Td>
                        <Td className="text-xs text-muted-foreground">{m.user.lastLoginAt ? dateTime(m.user.lastLoginAt) : '—'}</Td>
                        <Td><Badge tone={m.status === 'ACTIVE' ? 'success' : 'neutral'}>{t(`users.status${m.status}`)}</Badge></Td>
                        <Td className="text-end">
                          {can('users.update') && m.userId !== me?.user.id && (
                            <Button size="sm" variant="ghost" onClick={async () => { try { await api.organizations.updateMember(m.id, { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }); await refresh(); } catch (err) { onError(err); } }}>
                              {m.status === 'ACTIVE' ? t('users.disable') : t('users.enable')}
                            </Button>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </Card>
              {d.invitations.length > 0 && (
                <Card className="mt-5">
                  <CardHeader title={t('users.pendingInvitations')} />
                  <Table>
                    <TBody>
                      {d.invitations.map((i) => (
                        <Tr key={i.id}>
                          <Td><Num>{i.email}</Num></Td><Td>{roleLabel(t, i.role)}</Td><Td className="text-xs text-muted-foreground">{dateTime(i.expiresAt)}</Td>
                          <Td className="text-end">{can('users.delete') && <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await api.organizations.revokeInvitation(i.id); await refresh(); }}>{t('auth.revoke')}</Button>}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </Card>
              )}
            </>
          )}
        </QueryState>
      ) : (
        <QueryState query={roles}>{(r) => <PermissionMatrix roles={r} />}</QueryState>
      )}
      <Dialog open={!!invite} onOpenChange={(o) => !o && setInvite(null)} size="sm" title={t('users.invite')} footer={<Button type="submit" form="inv-form">{t('common.send')}</Button>}>
        {invite && (
          <form
            id="inv-form"
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.organizations.invite(invite.email.trim(), invite.roleId);
                toast.success(t('users.inviteSent', { email: invite.email }));
                setInvite(null);
                await refresh();
              } catch (err) {
                onError(err);
              }
            }}
          >
            <Field label={t('auth.email')} htmlFor="ie"><Input id="ie" type="email" dir="ltr" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
            <Field label={t('users.role')} htmlFor="ir"><Select id="ir" value={invite.roleId} onChange={(e) => setInvite({ ...invite, roleId: e.target.value })}>{roles.data?.map((r) => <option key={r.id} value={r.id}>{roleLabel(t, r)}</option>)}</Select></Field>
          </form>
        )}
      </Dialog>
    </div>
  );
}

export default function UsersPage() {
  return <Guard permission="users.read"><UsersScreen /></Guard>;
}

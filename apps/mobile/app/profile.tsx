import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Num, Row, Screen, Text } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth, useI18n } from '../src/providers/app';

export default function Profile() {
  const { t, dateTime } = useI18n();
  const { me } = useAuth();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['m-sessions'], queryFn: api.auth.sessions });
  return (
    <Screen>
      <Card>
        <Text weight="700" size={17}>{me?.user.fullName}</Text>
        <Num weight="400">{me?.user.email}</Num>
      </Card>
      <Text weight="700">{t('auth.sessions')}</Text>
      {sessions.data?.map((s) => (
        <Card key={s.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text weight="600">{s.deviceName ?? s.client}</Text>
            {s.current && <Badge label={t('auth.currentSession')} tone="success" />}
          </Row>
          <Text muted size={12}>{dateTime(s.createdAt)} · {s.ip ?? ''}</Text>
          {!s.current && <Button title={t('auth.revoke')} variant="outline" onPress={async () => { await api.auth.revokeSession(s.id); await qc.invalidateQueries({ queryKey: ['m-sessions'] }); }} />}
        </Card>
      ))}
    </Screen>
  );
}

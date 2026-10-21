import { Button, Card, Empty, Num, Row, Screen, Text } from '../src/components/ui';
import { useColors, useI18n, useSync } from '../src/providers/app';

/** Offline sync center: pending operations, conflicts and rejections, with explicit resolution. */
export default function SyncCenter() {
  const { t, te, dateTime, num } = useI18n();
  const c = useColors();
  const { pending, issues, lastSync, syncing, online, syncNow, resolve, refreshSnapshot } = useSync();
  return (
    <Screen>
      <Card>
        <Text weight="700">{online ? t('common.online') : t('common.offline')}</Text>
        <Text muted>{lastSync ? t('sync.lastSync', { date: dateTime(lastSync) }) : t('sync.never')}</Text>
        <Text>{pending.length ? t('sync.pending', { count: pending.length }) : t('sync.synced')}</Text>
        <Row>
          <Button title={t('sync.syncNow')} onPress={() => void syncNow()} loading={syncing} disabled={!online} style={{ flex: 1 }} />
          <Button title={t('sync.download')} variant="outline" onPress={() => void refreshSnapshot()} disabled={!online} style={{ flex: 1 }} />
        </Row>
      </Card>

      {issues.length > 0 && (
        <>
          <Text weight="700" size={17}>{t('sync.conflicts')}</Text>
          <Text muted>{t('sync.conflictHint')}</Text>
          {issues.map((op) => {
            const server = op.serverResult as { countedQty?: string; expectedQty?: string } | undefined;
            return (
              <Card key={op.clientOpId} style={{ borderColor: op.status === 'CONFLICT' ? c.warning : c.danger }}>
                <Text weight="600">{op.label ?? op.type}</Text>
                <Text muted size={12}>{dateTime(op.createdAt)}</Text>
                {op.status === 'CONFLICT' ? (
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text>{t('sync.myValue')}: <Num>{num(String(op.payload.countedQty))}</Num></Text>
                    <Text>{t('sync.serverValue')}: <Num>{server?.countedQty ? num(server.countedQty) : '—'}</Num></Text>
                  </Row>
                ) : (
                  <Text style={{ color: c.danger }}>{t('sync.rejected')}: {te(op.errorCode)}</Text>
                )}
                <Row>
                  {op.status === 'CONFLICT' && <Button title={t('sync.keepMine')} style={{ flex: 1 }} onPress={() => void resolve(op.clientOpId, 'keep')} />}
                  <Button title={t('sync.discard')} variant="outline" style={{ flex: 1 }} onPress={() => void resolve(op.clientOpId, 'discard')} />
                </Row>
              </Card>
            );
          })}
        </>
      )}

      <Text weight="700" size={17}>{t('sync.pending', { count: pending.length })}</Text>
      {pending.length === 0 ? <Empty text={t('sync.synced')} /> : pending.map((op) => (
        <Card key={op.clientOpId}>
          <Text weight="600">{op.label ?? op.type}</Text>
          <Text muted size={12}>{dateTime(op.createdAt)}</Text>
        </Card>
      ))}
    </Screen>
  );
}

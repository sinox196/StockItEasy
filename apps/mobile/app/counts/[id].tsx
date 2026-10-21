import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Scanner } from '../../src/components/scanner';
import { Badge, Button, Card, Input, Num, Row, Text } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { lookupCode } from '../../src/lib/lookup';
import { useColors, useI18n, useSync } from '../../src/providers/app';

interface Line { productId: string; name: string; sku: string; expected: number; counted: number | null; version: number }

/**
 * Physical count (workflow D). Scans add quantities ("add" operations never conflict);
 * typing a total sends a "replace" with the version the device saw, so a colleague's
 * newer count is reported as a conflict instead of being overwritten.
 */
export default function CountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, num } = useI18n();
  const c = useColors();
  const qc = useQueryClient();
  const { online, snapshot, enqueue, pending, issues } = useSync();
  const [last, setLast] = useState<string>();
  const [edit, setEdit] = useState<{ line: Line; value: string } | null>(null);
  const server = useQuery({ queryKey: ['m-count', id], queryFn: () => api.counts.get(id), enabled: online });

  const lines: Line[] = useMemo(() => {
    if (server.data?.lines) {
      return server.data.lines.map((l) => ({ productId: l.productId, name: l.product?.name ?? '', sku: l.product?.sku ?? '', expected: Number(l.expectedQty), counted: l.countedQty === null ? null : Number(l.countedQty), version: l.version }));
    }
    const sc = snapshot?.counts.find((x) => x.id === id);
    const pm = new Map(snapshot?.products.map((p) => [p.id, p]));
    return (sc?.lines ?? []).map((l) => ({ productId: l.productId, name: pm.get(l.productId)?.name ?? '', sku: pm.get(l.productId)?.sku ?? '', expected: Number(l.expectedQty), counted: l.countedQty === null ? null : Number(l.countedQty), version: l.version }));
  }, [server.data, snapshot, id]);

  // Local view = server value + operations not yet confirmed by the server.
  const local = useMemo(() => {
    const m = new Map<string, number | null>(lines.map((l) => [l.productId, l.counted]));
    for (const op of pending.filter((o) => o.type === 'STOCK_COUNT_LINE' && o.payload.countId === id)) {
      const pid = String(op.payload.productId);
      const q = Number(op.payload.countedQty);
      m.set(pid, op.payload.mode === 'replace' ? q : (m.get(pid) ?? 0) + q);
    }
    return m;
  }, [lines, pending, id]);

  const onCode = async (code: string) => {
    const hit = await lookupCode(code, online, snapshot).catch(() => null);
    if (!hit) return setLast(t('pos.notFound', { code }));
    await enqueue('STOCK_COUNT_LINE', { countId: id, productId: hit.productId, countedQty: String(hit.unitFactor), mode: 'add' }, { label: `${hit.name} +${hit.unitFactor}` });
    setLast(`${hit.name} +${num(hit.unitFactor)}`);
    void qc.invalidateQueries({ queryKey: ['m-count', id] });
  };

  const countIssues = issues.filter((o) => o.payload.countId === id);
  const countedLines = [...local.values()].filter((v) => v !== null).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        data={lines}
        keyExtractor={(l) => l.productId}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 12 }}>
            <Scanner height={200} onCode={onCode} />
            {last && <Text weight="700" style={{ color: c.success }}>{t('mobile.countSaved')} — {last}</Text>}
            <Row style={{ flexWrap: 'wrap' }}>
              <Badge label={t('counts.progress', { counted: countedLines, total: lines.length })} tone="info" />
              <Badge label={pending.length ? t('sync.pending', { count: pending.length }) : t('sync.synced')} tone={pending.length ? 'warning' : 'success'} />
              {countIssues.length > 0 && <Badge label={`${t('sync.conflicts')}: ${countIssues.length}`} tone="danger" />}
            </Row>
          </View>
        }
        renderItem={({ item }) => {
          const value = local.get(item.productId);
          const diff = value === null || value === undefined ? null : value - item.expected;
          return (
            <Pressable onPress={() => setEdit({ line: item, value: value === null || value === undefined ? '' : String(value) })} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text weight="600">{item.name}</Text>
                <Num size={12} weight="400" style={{ color: c.textMuted }}>{item.sku} · {t('counts.expected')} {num(item.expected)}</Num>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Num size={18} weight="800">{value === null || value === undefined ? '—' : num(value)}</Num>
                {diff !== null && diff !== 0 && <Num size={12} style={{ color: diff < 0 ? c.danger : c.success }}>{diff > 0 ? '+' : ''}{num(diff)}</Num>}
              </View>
            </Pressable>
          );
        }}
      />
      {edit && (
        <Card style={{ position: 'absolute', left: 12, right: 12, bottom: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 }}>
          <Text weight="700">{edit.line.name}</Text>
          <Input label={t('counts.counted')} value={edit.value} onChangeText={(v) => setEdit({ ...edit, value: v })} keyboardType="decimal-pad" autoFocus ltr />
          <Row>
            <Button title={t('common.cancel')} variant="outline" style={{ flex: 1 }} onPress={() => setEdit(null)} />
            <Button
              title={t('common.save')}
              style={{ flex: 1 }}
              disabled={edit.value.trim() === '' || Number.isNaN(Number(edit.value.replace(',', '.')))}
              onPress={async () => {
                await enqueue('STOCK_COUNT_LINE', { countId: id, productId: edit.line.productId, countedQty: edit.value.replace(',', '.'), mode: 'replace' }, { baseVersion: edit.line.version, label: `${edit.line.name} = ${edit.value}` });
                setEdit(null);
                void qc.invalidateQueries({ queryKey: ['m-count', id] });
              }}
            />
          </Row>
        </Card>
      )}
    </View>
  );
}

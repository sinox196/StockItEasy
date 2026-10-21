import { describe, expect, it, vi } from 'vitest';
import { MemoryOpStore, PushResult, SyncEngine, SyncTransport } from '../src/lib/sync-core';

let seq = 0;
const newId = () => `op-${++seq}`;

/** Fake server: applies each client op id once; a count line with a stale base version conflicts. */
function fakeServer() {
  const applied = new Set<string>();
  let online = true;
  let authValid = true;
  let serverVersion = 1;
  const transport: SyncTransport = {
    push: vi.fn(async (_device: string, ops: { clientOpId: string; type: string; payload: Record<string, unknown>; baseVersion?: number }[]) => {
      if (!online) throw Object.assign(new Error('offline'), { code: 'NETWORK' });
      if (!authValid) throw Object.assign(new Error('auth'), { code: 'UNAUTHENTICATED' });
      const results: PushResult[] = ops.map((o) => {
        if (applied.has(o.clientOpId)) return { clientOpId: o.clientOpId, status: 'DUPLICATE' };
        if (o.type === 'STOCK_ADJUSTMENT' && Number((o.payload as { quantity: string }).quantity) > 100) {
          applied.add(o.clientOpId);
          return { clientOpId: o.clientOpId, status: 'REJECTED', error: { code: 'INSUFFICIENT_STOCK' } };
        }
        if (o.baseVersion !== undefined && o.baseVersion !== serverVersion) {
          applied.add(o.clientOpId);
          return { clientOpId: o.clientOpId, status: 'CONFLICT', result: { countedQty: '9', version: serverVersion } };
        }
        applied.add(o.clientOpId);
        serverVersion++;
        return { clientOpId: o.clientOpId, status: 'APPLIED' };
      });
      return { results, serverTime: new Date().toISOString() };
    }),
  };
  return {
    transport,
    applied,
    setOnline: (v: boolean) => (online = v),
    setAuth: (v: boolean) => (authValid = v),
    bumpVersion: () => serverVersion++,
  };
}

describe('offline sync engine', () => {
  it('keeps operations while offline and applies them once on reconnection (workflow D)', async () => {
    const server = fakeServer();
    const store = new MemoryOpStore();
    const engine = new SyncEngine(store, server.transport, 'device-1', newId);
    server.setOnline(false);
    await engine.enqueue('STOCK_COUNT_LINE', { countId: 'c1', productId: 'p1', countedQty: '3', mode: 'add' });
    await engine.enqueue('STOCK_COUNT_LINE', { countId: 'c1', productId: 'p2', countedQty: '1', mode: 'add' });
    const offline = await engine.sync();
    expect(offline).toMatchObject({ ok: false, errorCode: 'NETWORK', pending: 2 });
    expect(await engine.pending()).toHaveLength(2);

    server.setOnline(true);
    const online = await engine.sync();
    expect(online).toMatchObject({ ok: true, applied: 2, pending: 0 });
    expect(server.applied.size).toBe(2);
  });

  it('never applies an operation twice when the response is lost', async () => {
    const server = fakeServer();
    const store = new MemoryOpStore();
    const engine = new SyncEngine(store, server.transport, 'd', newId);
    const op = await engine.enqueue('STOCK_ADJUSTMENT', { quantity: '1' });
    // The server applied it but the device never got the answer.
    await server.transport.push('d', [op]);
    const report = await engine.sync();
    expect(report.applied).toBe(1);
    expect(server.applied.size).toBe(1);
    expect(await store.all()).toHaveLength(0);
  });

  it('surfaces conflicts instead of overwriting and lets the user decide', async () => {
    const server = fakeServer();
    const store = new MemoryOpStore();
    const engine = new SyncEngine(store, server.transport, 'd', newId);
    const op = await engine.enqueue('STOCK_COUNT_LINE', { countId: 'c', productId: 'p', countedQty: '7' }, { baseVersion: 1 });
    server.bumpVersion(); // someone else counted meanwhile
    const r = await engine.sync();
    expect(r.conflicts).toBe(1);
    const [issue] = await engine.issues();
    expect(issue).toMatchObject({ status: 'CONFLICT', serverResult: { countedQty: '9' } });

    await engine.resolve(op.clientOpId, 'keep');
    const after = await engine.sync();
    expect(after.applied).toBe(1);
    expect(await store.all()).toHaveLength(0);
  });

  it('keeps rejected operations visible with their reason until discarded', async () => {
    const server = fakeServer();
    const store = new MemoryOpStore();
    const engine = new SyncEngine(store, server.transport, 'd', newId);
    const op = await engine.enqueue('STOCK_ADJUSTMENT', { quantity: '500' });
    const r = await engine.sync();
    expect(r.rejected).toBe(1);
    expect((await engine.issues())[0]).toMatchObject({ status: 'REJECTED', errorCode: 'INSUFFICIENT_STOCK' });
    await engine.resolve(op.clientOpId, 'discard');
    expect(await store.all()).toHaveLength(0);
  });

  it('does not lose operations when the session expired during sync', async () => {
    const server = fakeServer();
    const store = new MemoryOpStore();
    const engine = new SyncEngine(store, server.transport, 'd', newId);
    await engine.enqueue('STOCK_ADJUSTMENT', { quantity: '2' });
    server.setAuth(false);
    expect(await engine.sync()).toMatchObject({ ok: false, errorCode: 'UNAUTHENTICATED' });
    expect(await engine.pending()).toHaveLength(1);
    server.setAuth(true);
    expect((await engine.sync()).applied).toBe(1);
  });

  it('runs a single sync at a time', async () => {
    const server = fakeServer();
    const engine = new SyncEngine(new MemoryOpStore(), server.transport, 'd', newId);
    await engine.enqueue('STOCK_ADJUSTMENT', { quantity: '1' });
    const [a, b] = await Promise.all([engine.sync(), engine.sync()]);
    expect(a).toBe(b);
    expect(server.transport.push).toHaveBeenCalledTimes(1);
  });
});

/**
 * Offline operation queue — platform-independent so it can be unit-tested.
 *
 * Guarantees
 * - Every operation gets a client id when it is created; the server applies an id
 *   at most once, so replays after a lost response are harmless.
 * - Operations are never dropped silently: they leave the queue only when the server
 *   confirms them (APPLIED / DUPLICATE) or when the user discards a conflict.
 * - Conflicts and rejections stay visible until the user resolves them; nothing
 *   overwrites server stock without an explicit decision.
 * - A network or authentication failure leaves the queue untouched.
 */

export type OpType = 'STOCK_COUNT_LINE' | 'STOCK_ADJUSTMENT';
export type OpStatus = 'PENDING' | 'CONFLICT' | 'REJECTED';

export interface QueuedOp {
  clientOpId: string;
  type: OpType;
  payload: Record<string, unknown>;
  createdAt: string;
  baseVersion?: number;
  status: OpStatus;
  /** Server state returned with a conflict, or the rejection reason. */
  serverResult?: unknown;
  errorCode?: string;
  label?: string;
}

export interface OpStore {
  all(): Promise<QueuedOp[]>;
  put(op: QueuedOp): Promise<void>;
  remove(clientOpId: string): Promise<void>;
}

export interface PushResult {
  clientOpId: string;
  status: 'APPLIED' | 'CONFLICT' | 'REJECTED' | 'DUPLICATE';
  result?: unknown;
  error?: { code: string; details?: unknown };
}

export interface SyncTransport {
  push(deviceId: string, ops: Omit<QueuedOp, 'status' | 'serverResult' | 'errorCode' | 'label'>[]): Promise<{ results: PushResult[]; serverTime: string }>;
}

export interface SyncReport {
  ok: boolean;
  applied: number;
  conflicts: number;
  rejected: number;
  pending: number;
  serverTime?: string;
  errorCode?: string;
}

const BATCH = 200;

export class SyncEngine {
  private running: Promise<SyncReport> | null = null;

  constructor(
    private readonly store: OpStore,
    private readonly transport: SyncTransport,
    private readonly deviceId: string,
    private readonly newId: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async enqueue(type: OpType, payload: Record<string, unknown>, opts: { baseVersion?: number; label?: string } = {}): Promise<QueuedOp> {
    const op: QueuedOp = { clientOpId: this.newId(), type, payload, createdAt: this.now().toISOString(), baseVersion: opts.baseVersion, status: 'PENDING', label: opts.label };
    await this.store.put(op);
    return op;
  }

  async pending() {
    return (await this.store.all()).filter((o) => o.status === 'PENDING');
  }

  async issues() {
    return (await this.store.all()).filter((o) => o.status !== 'PENDING');
  }

  /** Single-flight: concurrent callers share the same run. */
  sync(): Promise<SyncReport> {
    if (!this.running) this.running = this.run().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<SyncReport> {
    const report: SyncReport = { ok: true, applied: 0, conflicts: 0, rejected: 0, pending: 0 };
    const queue = (await this.pending()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (let i = 0; i < queue.length; i += BATCH) {
      const batch = queue.slice(i, i + BATCH);
      let res: Awaited<ReturnType<SyncTransport['push']>>;
      try {
        res = await this.transport.push(
          this.deviceId,
          batch.map(({ clientOpId, type, payload, createdAt, baseVersion }) => ({ clientOpId, type, payload, createdAt, baseVersion })),
        );
      } catch (e) {
        report.ok = false;
        report.errorCode = (e as { code?: string })?.code ?? 'NETWORK';
        break;
      }
      report.serverTime = res.serverTime;
      const byId = new Map(batch.map((o) => [o.clientOpId, o]));
      for (const r of res.results) {
        const op = byId.get(r.clientOpId);
        if (!op) continue;
        if (r.status === 'APPLIED' || r.status === 'DUPLICATE') {
          await this.store.remove(op.clientOpId);
          report.applied++;
        } else if (r.status === 'CONFLICT') {
          await this.store.put({ ...op, status: 'CONFLICT', serverResult: r.result });
          report.conflicts++;
        } else {
          await this.store.put({ ...op, status: 'REJECTED', errorCode: r.error?.code ?? 'UNKNOWN', serverResult: r.error?.details });
          report.rejected++;
        }
      }
    }
    report.pending = (await this.pending()).length;
    return report;
  }

  /**
   * "keep": the user confirms their value — it is re-queued as a new operation
   * without the stale base version, so it applies on the next sync.
   * "discard": the server value stays; the local operation is dropped.
   */
  async resolve(clientOpId: string, choice: 'keep' | 'discard'): Promise<void> {
    const op = (await this.store.all()).find((o) => o.clientOpId === clientOpId);
    if (!op) return;
    await this.store.remove(clientOpId);
    if (choice === 'keep') {
      await this.store.put({ ...op, clientOpId: this.newId(), baseVersion: undefined, status: 'PENDING', serverResult: undefined, errorCode: undefined, createdAt: this.now().toISOString() });
    }
  }
}

/** In-memory store (tests, and fallback when SQLite is unavailable). */
export class MemoryOpStore implements OpStore {
  private ops = new Map<string, QueuedOp>();
  async all() {
    return [...this.ops.values()];
  }
  async put(op: QueuedOp) {
    this.ops.set(op.clientOpId, op);
  }
  async remove(id: string) {
    this.ops.delete(id);
  }
}

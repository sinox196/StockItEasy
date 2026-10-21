import * as SQLite from 'expo-sqlite';
import type { OpStore, QueuedOp } from './sync-core';

/**
 * Local SQLite database: offline operation queue, key/value preferences and the
 * last synchronised snapshot (catalogue + open counts) used when offline.
 * Tokens are NOT stored here (see SecureStore in session.ts).
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function db() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync('stockiteasy.db');
      await d.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ops (client_op_id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
      `);
      return d;
    })();
  }
  return dbPromise;
}

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    const row = await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : null;
  },
  async set(key: string, value: unknown) {
    await (await db()).runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
  },
  async remove(key: string) {
    await (await db()).runAsync('DELETE FROM kv WHERE key = ?', key);
  },
};

export class SqliteOpStore implements OpStore {
  async all(): Promise<QueuedOp[]> {
    const rows = await (await db()).getAllAsync<{ body: string }>('SELECT body FROM ops ORDER BY created_at ASC');
    return rows.map((r) => JSON.parse(r.body) as QueuedOp);
  }
  async put(op: QueuedOp) {
    await (await db()).runAsync('INSERT OR REPLACE INTO ops (client_op_id, created_at, body) VALUES (?, ?, ?)', op.clientOpId, op.createdAt, JSON.stringify(op));
  }
  async remove(id: string) {
    await (await db()).runAsync('DELETE FROM ops WHERE client_op_id = ?', id);
  }
}

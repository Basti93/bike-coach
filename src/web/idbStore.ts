import { applyRecord, type RecordKind, type TrackedRecord } from '../shared/records';
import { readable } from './validate';

export type Refusal = { id: string; reason: string };
type Row = { key: string; seq: number; rec: TrackedRecord; /** Came from the server: not pending. */ remote?: boolean };
const KINDS: readonly RecordKind[] = ['workout', 'routine', 'exercise', 'mobility', 'complaint', 'plan'];

export type IdbStore = {
  /** Records the screens can draw. Unreadable ones stay stored (and are still synced) but are not listed. */
  list(kind: RecordKind): Promise<TrackedRecord[]>;
  /** Resolves only after the transaction completed, so the data is durable. `applyRecord` decides; nothing is overwritten blindly. */
  put(r: TrackedRecord): Promise<void>;
  /** One transaction for a whole page. */
  applyMany(rs: TrackedRecord[]): Promise<void>;
  changedSince(cursor: number): Promise<{ records: TrackedRecord[]; cursor: number }>;
  cursors: { get(): Promise<{ sent: number; received: number }>; set(c: { sent: number; received: number }): Promise<void> };
  /** Refused records stay in their own store, with the record as it was. */
  addRefused(list: Refusal[]): Promise<void>;
  /** These were accepted by the server after all (a later edit): they leave the refused list. */
  clearRefused(ids: string[]): Promise<void>;
  /** Last known counts, readable at once. */
  counts(): { pending: number; refused: number };
  subscribe(fn: () => void): () => void;
  close(): void;
};

const done = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error ?? new Error('transaction failed'));
  tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
});
const req = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

const isStale = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { name?: string }).name === 'InvalidStateError';

/** One IndexedDB database per account, so two people on one phone never see each other's data. */
export async function openIdb(account: string, factory: IDBFactory = indexedDB, opts: { timeoutMs?: number } = {}): Promise<IdbStore> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const connect = () => new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error('timeout opening the database')); }, timeoutMs);
    const open = factory.open(`pandafit-${account}`, 1);
    open.onupgradeneeded = () => {
      const d = open.result;
      d.createObjectStore('records', { keyPath: 'key' }).createIndex('seq', 'seq');
      d.createObjectStore('meta');
      d.createObjectStore('refused', { keyPath: 'id' });
    };
    // A late answer after the timeout is closed again, so no handle leaks.
    open.onsuccess = () => { clearTimeout(timer); if (settled) open.result.close(); else resolve(open.result); };
    open.onerror = () => { clearTimeout(timer); reject(open.error); };
    open.onblocked = () => { clearTimeout(timer); settled = true; reject(new Error('blocked')); };
  });
  let db: IDBDatabase | null = await connect();
  let closed = false;
  const watch = (d: IDBDatabase): IDBDatabase => {
    // WebKit drops connections after backgrounding; another tab's upgrade asks us to let go. Reopened on the next use.
    d.onclose = () => { if (db === d) db = null; };
    d.onversionchange = () => { d.close(); if (db === d) db = null; };
    return d;
  };
  watch(db);
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((f) => { try { f(); } catch { /* one listener must not stop the rest */ } });
  let counts = { pending: 0, refused: 0 };

  /** Runs an operation on a live connection; a dead one is reopened and the operation tried once more. */
  async function run<T>(op: (d: IDBDatabase) => Promise<T>): Promise<T> {
    if (closed) throw new Error('store closed');
    for (let attempt = 0; ; attempt++) {
      try {
        if (!db) db = watch(await connect());
        return await op(db);
      } catch (e) {
        if (attempt === 0 && (isStale(e) || db === null)) { try { db?.close(); } catch { /* already gone */ } db = null; continue; }
        throw e;
      }
    }
  }

  async function refreshCounts(): Promise<boolean> {
    if (closed) return false;
    const next = await run(async (d) => {
      const tx = d.transaction(['records', 'meta', 'refused'], 'readonly');
      const cur = ((await req(tx.objectStore('meta').get('cursors'))) as { sent: number } | undefined)?.sent ?? 0;
      const rows = (await req(tx.objectStore('records').index('seq').getAll(IDBKeyRange.lowerBound(cur, true)))) as Row[];
      const refused = await req(tx.objectStore('refused').count());
      return { pending: rows.filter((r) => !r.remote).length, refused };
    });
    const changed = next.pending !== counts.pending || next.refused !== counts.refused;
    counts = next;
    return changed;
  }

  async function apply(rs: TrackedRecord[], remote: boolean): Promise<void> {
    if (rs.length === 0) return;
    const changed = await run(async (d) => {
      // Local writes ask for a durable commit where the browser supports the option.
      const tx = d.transaction(['records', 'meta'], 'readwrite', { durability: remote ? 'default' : 'strict' });
      const finished = done(tx);
      const records = tx.objectStore('records'), meta = tx.objectStore('meta');
      let seq = ((await req(meta.get('seq'))) as number | undefined) ?? 0;
      let any = false;
      for (const r of rs) {
        const key = `${r.kind}:${r.id}`;
        const have = (await req(records.get(key))) as Row | undefined;
        const { keep } = applyRecord(have?.rec, r);
        if (have && keep === have.rec) continue;
        seq += 1; any = true;
        records.put({ key, seq, rec: keep, remote } satisfies Row);
      }
      if (any) meta.put(seq, 'seq');
      await finished;
      return any;
    });
    await refreshCounts();
    if (changed) notify();
  }

  await refreshCounts();
  return {
    list: (kind) => run(async (d) => {
      const tx = d.transaction('records', 'readonly');
      const rows = (await req(tx.objectStore('records').getAll(IDBKeyRange.bound(`${kind}:`, `${kind}:￿`)))) as Row[];
      return rows.map((r) => r.rec).filter(readable);
    }),
    put: (r) => apply([r], false),
    applyMany: (rs) => apply(rs, true),
    changedSince: (cursor) => run(async (d) => {
      const tx = d.transaction('records', 'readonly');
      const rows = (await req(tx.objectStore('records').index('seq').getAll(IDBKeyRange.lowerBound(cursor, true)))) as Row[];
      return { records: rows.map((r) => r.rec), cursor: rows.reduce((m, r) => Math.max(m, r.seq), cursor) };
    }),
    cursors: {
      get: () => run(async (d) => {
        const tx = d.transaction('meta', 'readonly');
        const c = (await req(tx.objectStore('meta').get('cursors'))) as { sent: number; received: number } | undefined;
        return { sent: c?.sent ?? 0, received: c?.received ?? 0 };
      }),
      async set(c) {
        await run(async (d) => {
          const tx = d.transaction('meta', 'readwrite');
          const finished = done(tx);
          tx.objectStore('meta').put({ sent: c.sent, received: c.received }, 'cursors');
          await finished;
        });
        if (await refreshCounts()) notify();
      },
    },
    async addRefused(list) {
      if (list.length === 0) return;
      await run(async (d) => {
        const tx = d.transaction(['records', 'refused'], 'readwrite');
        const finished = done(tx);
        for (const x of list) {
          let record: TrackedRecord | null = null;
          for (const k of KINDS) {
            const row = (await req(tx.objectStore('records').get(`${k}:${x.id}`))) as Row | undefined;
            if (row) { record = row.rec; break; }
          }
          tx.objectStore('refused').put({ id: x.id, reason: x.reason, record });
        }
        await finished;
      });
      if (await refreshCounts()) notify();
    },
    async clearRefused(ids) {
      if (ids.length === 0) return;
      await run(async (d) => {
        const tx = d.transaction('refused', 'readwrite');
        const finished = done(tx);
        for (const id of ids) tx.objectStore('refused').delete(id);
        await finished;
      });
      if (await refreshCounts()) notify();
    },
    counts: () => counts,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    close() { closed = true; try { db?.close(); } catch { /* ignore */ } db = null; },
  };
}

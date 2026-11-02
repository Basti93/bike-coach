import { applyRecord, type RecordKind, type TrackedRecord } from '../shared/records';

export type Refusal = { id: string; reason: string };
type Row = { key: string; seq: number; rec: TrackedRecord };
const KINDS: readonly RecordKind[] = ['workout', 'routine', 'exercise', 'mobility', 'complaint', 'plan'];

export type IdbStore = {
  list(kind: RecordKind): Promise<TrackedRecord[]>;
  /** Resolves only after the transaction completed, so the data is durable. `applyRecord` decides; nothing is overwritten blindly. */
  put(r: TrackedRecord): Promise<void>;
  /** One transaction for a whole page. */
  applyMany(rs: TrackedRecord[]): Promise<void>;
  changedSince(cursor: number): Promise<{ records: TrackedRecord[]; cursor: number }>;
  cursors: { get(): Promise<{ sent: number; received: number }>; set(c: { sent: number; received: number }): Promise<void> };
  /** Refused records stay in their own store, with the record as it was. */
  addRefused(list: Refusal[]): Promise<void>;
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

/** One IndexedDB database per account, so two people on one phone never see each other's data. */
export async function openIdb(account: string, factory: IDBFactory = indexedDB): Promise<IdbStore> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open(`pandafit-${account}`, 1);
    open.onupgradeneeded = () => {
      const d = open.result;
      d.createObjectStore('records', { keyPath: 'key' }).createIndex('seq', 'seq');
      d.createObjectStore('meta');
      d.createObjectStore('refused', { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('blocked'));
  });
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((f) => { try { f(); } catch { /* one listener must not stop the rest */ } });
  let counts = { pending: 0, refused: 0 };
  let closed = false;

  async function refreshCounts(): Promise<void> {
    if (closed) return;
    const tx = db.transaction(['records', 'meta', 'refused'], 'readonly');
    const cur = ((await req(tx.objectStore('meta').get('cursors'))) as { sent: number } | undefined)?.sent ?? 0;
    const pending = await req(tx.objectStore('records').index('seq').count(IDBKeyRange.lowerBound(cur, true)));
    const refused = await req(tx.objectStore('refused').count());
    counts = { pending, refused };
  }

  async function apply(rs: TrackedRecord[]): Promise<void> {
    if (rs.length === 0) return;
    const tx = db.transaction(['records', 'meta'], 'readwrite');
    const finished = done(tx);
    const records = tx.objectStore('records'), meta = tx.objectStore('meta');
    let seq = ((await req(meta.get('seq'))) as number | undefined) ?? 0;
    let changed = false;
    for (const r of rs) {
      const key = `${r.kind}:${r.id}`;
      const have = (await req(records.get(key))) as Row | undefined;
      const { keep } = applyRecord(have?.rec, r);
      if (have && keep === have.rec) continue;
      seq += 1; changed = true;
      records.put({ key, seq, rec: keep } satisfies Row);
    }
    if (changed) meta.put(seq, 'seq');
    await finished;
    await refreshCounts();
    if (changed) notify();
  }

  await refreshCounts();
  return {
    async list(kind) {
      const tx = db.transaction('records', 'readonly');
      const rows = (await req(tx.objectStore('records').getAll(IDBKeyRange.bound(`${kind}:`, `${kind}:￿`)))) as Row[];
      return rows.map((r) => r.rec);
    },
    put: (r) => apply([r]),
    applyMany: apply,
    async changedSince(cursor) {
      const tx = db.transaction('records', 'readonly');
      const rows = (await req(tx.objectStore('records').index('seq').getAll(IDBKeyRange.lowerBound(cursor, true)))) as Row[];
      return { records: rows.map((r) => r.rec), cursor: rows.reduce((m, r) => Math.max(m, r.seq), cursor) };
    },
    cursors: {
      async get() {
        const tx = db.transaction('meta', 'readonly');
        const c = (await req(tx.objectStore('meta').get('cursors'))) as { sent: number; received: number } | undefined;
        return { sent: c?.sent ?? 0, received: c?.received ?? 0 };
      },
      async set(c) {
        const tx = db.transaction('meta', 'readwrite');
        const finished = done(tx);
        tx.objectStore('meta').put({ sent: c.sent, received: c.received }, 'cursors');
        await finished;
        await refreshCounts();
        notify();
      },
    },
    async addRefused(list) {
      if (list.length === 0) return;
      const tx = db.transaction(['records', 'refused'], 'readwrite');
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
      await refreshCounts();
      notify();
    },
    counts: () => counts,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    close() { closed = true; db.close(); },
  };
}

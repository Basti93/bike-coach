import type { RecordKind, TrackedRecord } from '../shared/records';
import type { TrackingPort } from '../tracking/ports';
import { syncRecords } from '../tracking/sync';
import type { IdbStore } from './idbStore';

export type SyncResult = 'ok' | 'login' | 'offline';
export type WebPort = TrackingPort & {
  /** One sync run. Never throws. 'login' means the cookie is gone: all data and open workouts stay. */
  sync(): Promise<SyncResult>;
  status(): 'ok' | 'login' | 'offline';
  /** Fires when the login state changes. */
  onStatus(fn: () => void): () => void;
  dispose(): void;
};

class Unauthorized extends Error {}
const TIMEOUT_MS = 15_000;
const PAGE = 200;
const EVERY_MS = 60_000;
const SOON_MS = 1500;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const KINDS: readonly string[] = ['workout', 'routine', 'exercise', 'mobility', 'complaint', 'plan'];
const valid = (x: unknown): x is TrackedRecord => isObj(x) && KINDS.includes(x.kind as string) && typeof x.id === 'string' && typeof x.updatedMs === 'number' && typeof x.deleted === 'boolean' && x.body !== undefined;

export function createWebPort(o: {
  store: IdbStore; fetchFn?: typeof fetch; now?: () => number;
  /** Where `online` and visibility events come from. Default: window. */
  events?: EventTarget;
  intervalMs?: number;
}): WebPort {
  const { store } = o;
  const now = o.now ?? Date.now;
  const fetchFn = o.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const events = o.events ?? (typeof window !== 'undefined' ? window : undefined);
  let status: 'ok' | 'login' | 'offline' = 'ok';
  let lastOkMs: number | null = null;
  let running: Promise<SyncResult> | null = null;
  let again = false;
  let disposed = false;
  let soon: ReturnType<typeof setTimeout> | null = null;
  const statusSubs = new Set<() => void>();
  const setStatus = (s: typeof status) => { if (s !== status) { status = s; statusSubs.forEach((f) => f()); } };

  const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> => {
    const res = await fetchFn(path, {
      method, credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (res.status === 401) throw new Unauthorized();
    if (!res.ok) throw new Error(`server answered ${res.status}`);
    return res.json();
  };

  async function run(): Promise<SyncResult> {
    const refusedWrites: Promise<void>[] = [];
    try {
      await syncRecords({
        cursors: store.cursors,
        local: { changedSince: (c) => store.changedSince(c), apply: (r) => store.applyMany([r]), applyMany: (rs) => store.applyMany(rs) },
        send: async (records) => {
          const out = await call('POST', '/records', { records });
          const refused = isObj(out) && Array.isArray(out.refused)
            ? out.refused.flatMap((x) => (isObj(x) && typeof x.id === 'string' ? [{ id: x.id, reason: typeof x.reason === 'string' ? x.reason : '' }] : []))
            : [];
          return { refused };
        },
        fetchSince: async (cursor) => {
          const out = await call('GET', `/records?since=${cursor}&limit=${PAGE}`);
          if (!isObj(out) || !Array.isArray(out.records) || typeof out.cursor !== 'number') throw new Error('unexpected answer');
          return { records: out.records.filter(valid), cursor: out.cursor, more: out.more === true, reset: out.reset === true };
        },
        refused: (list) => { refusedWrites.push(store.addRefused(list)); },
        mayContinue: () => !disposed,
      });
      await Promise.all(refusedWrites);
      lastOkMs = now();
      setStatus('ok');
      return 'ok';
    } catch (e) {
      const r: SyncResult = e instanceof Unauthorized ? 'login' : 'offline';
      setStatus(r);
      return r;
    }
  }

  const sync = (): Promise<SyncResult> => {
    if (running) { again = true; return running; }
    const p = run().finally(() => {
      running = null;
      if (again && !disposed) { again = false; void sync(); }
    });
    running = p;
    return p;
  };

  const schedule = () => {
    if (disposed || soon || status === 'login') return;
    soon = setTimeout(() => { soon = null; void sync(); }, SOON_MS);
  };
  const onOnline = () => { void sync(); };
  const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void sync(); };
  events?.addEventListener('online', onOnline);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(() => { void sync(); }, o.intervalMs ?? EVERY_MS);

  return {
    list: (kind: RecordKind) => store.list(kind),
    async put(r) { await store.put(r); schedule(); },
    subscribe: (fn) => store.subscribe(fn),
    syncState: () => { const c = store.counts(); return { pending: c.pending, lastOkMs, refused: c.refused }; },
    sync,
    status: () => status,
    onStatus(fn) { statusSubs.add(fn); return () => { statusSubs.delete(fn); }; },
    dispose() {
      disposed = true;
      if (soon) clearTimeout(soon);
      clearInterval(timer);
      events?.removeEventListener('online', onOnline);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    },
  };
}

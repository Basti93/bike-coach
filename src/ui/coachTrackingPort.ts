import type { CoachClientMessage, CoachServerMessage } from '../shared/coach-protocol';
import { applyRecord, type RecordKind, type TrackedRecord } from '../shared/records';
import type { TrackingPort } from '../tracking/ports';

type Entry = { record: TrackedRecord };
type Answer = Extract<CoachServerMessage, { type: 'records-put-result' | 'records' }>;
export type CoachTrackingPort = TrackingPort & {
  /** Messages from the Mac that belong to the tracking. */
  handle(m: CoachServerMessage): void;
  /** The socket is open (again): unsent records go out in order. */
  opened(): void;
  /** The socket is gone: requests without an answer stay in the queue. */
  closed(): void;
  dispose(): void;
};

const keyOf = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`;
const sameRecord = (a: TrackedRecord, b: TrackedRecord) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The tracking screens' view of the Mac's record store, over the coach socket. A put is confirmed only after the Mac
 * stored it. While the socket is down, or an answer does not come, the record waits in localStorage (the bike-coach
 * data folder, so it survives a restart) and is removed only after the Mac confirmed it.
 */
export function createCoachTrackingPort(o: {
  profileId: string;
  send: (m: CoachClientMessage) => boolean;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => number;
  timeoutMs?: number;
}): CoachTrackingPort {
  const { profileId } = o;
  const now = o.now ?? Date.now;
  const timeoutMs = o.timeoutMs ?? 10_000;
  const storageKey = `pandafit.tracking.queue.${profileId}`;
  const store = (): Pick<Storage, 'getItem' | 'setItem'> => o.storage ?? localStorage;
  const subs = new Set<() => void>();
  const waiting = new Map<string, { settle: (a: Answer | null) => void; timer: ReturnType<typeof setTimeout> }>();
  const cache = new Map<RecordKind, Map<string, TrackedRecord>>();
  let lastOkMs: number | null = null;
  let inflight = 0;
  let flushing = false;
  let seq = 0;
  let disposed = false;
  const notify = () => subs.forEach((f) => { try { f(); } catch { /* one listener must not stop the rest */ } });

  const readQueue = (): Entry[] => {
    try {
      const v = JSON.parse(store().getItem(storageKey) ?? '[]') as unknown;
      return Array.isArray(v) ? v.filter((e): e is Entry => typeof e === 'object' && e !== null && typeof (e as Entry).record === 'object') : [];
    } catch { return []; }
  };
  const writeQueue = (q: Entry[]): void => store().setItem(storageKey, JSON.stringify(q));

  const enqueue = (r: TrackedRecord): void => {
    const q = readQueue();
    const i = q.findIndex((e) => keyOf(e.record) === keyOf(r));
    if (i < 0) q.push({ record: r });
    else q[i] = { record: applyRecord(q[i].record, r).keep };
    writeQueue(q);
  };
  const dequeue = (r: TrackedRecord): void => {
    // A newer version of the same record may have replaced it while it was on its way: that one stays.
    const q = readQueue().filter((e) => !sameRecord(e.record, r));
    writeQueue(q);
  };

  const request = (m: CoachClientMessage & { requestId: string }): Promise<Answer | null> =>
    new Promise((resolve) => {
      const settle = (a: Answer | null) => {
        const w = waiting.get(m.requestId);
        if (!w) return;
        clearTimeout(w.timer);
        waiting.delete(m.requestId);
        resolve(a);
      };
      const timer = setTimeout(() => settle(null), timeoutMs);
      waiting.set(m.requestId, { settle, timer });
      if (!o.send(m)) settle(null);
    });

  const remember = (r: TrackedRecord) => {
    const m = cache.get(r.kind);
    if (m) m.set(r.id, applyRecord(m.get(r.id), r).keep);
  };

  const flush = async (): Promise<void> => {
    if (flushing || disposed) return;
    flushing = true;
    try {
      for (;;) {
        const head = readQueue()[0];
        if (!head) break;
        inflight++;
        let a: Answer | null;
        try { a = await request({ type: 'records-put', requestId: `${profileId}-${now()}-${++seq}`, profileId, record: head.record }); } finally { inflight--; }
        if (!a || a.type !== 'records-put-result') break;
        if (a.ok) { lastOkMs = now(); remember(head.record); dequeue(head.record); notify(); continue; }
        // A refusal never turns into a yes; keeping it would block everything behind it.
        if (a.refused) { dequeue(head.record); continue; }
        break;
      }
    } catch { /* stays queued, the next connection tries again */ } finally { flushing = false; notify(); }
  };

  return {
    async list(kind) {
      const queued = readQueue().map((e) => e.record).filter((r) => r.kind === kind);
      let base = cache.get(kind);
      const a = await request({ type: 'records-list', requestId: `${profileId}-${now()}-${++seq}`, profileId, kind });
      if (a && a.type === 'records') {
        base = new Map(a.records.map((r) => [r.id, r]));
        cache.set(kind, base);
      }
      if (!base) throw new Error('Die Daten konnten nicht geladen werden.');
      const merged = new Map(base);
      for (const r of queued) merged.set(r.id, applyRecord(merged.get(r.id), r).keep);
      return [...merged.values()];
    },
    async put(r) {
      // Behind unsent records, so the order of edits is kept.
      if (readQueue().length > 0 || flushing) {
        enqueue(r);
        notify();
        void flush();
        return;
      }
      inflight++;
      let a: Answer | null;
      try { a = await request({ type: 'records-put', requestId: `${profileId}-${now()}-${++seq}`, profileId, record: r }); } finally { inflight--; }
      if (a && a.type === 'records-put-result') {
        if (!a.ok) throw new Error('Das Training konnte nicht gespeichert werden.');
        lastOkMs = now();
        remember(r);
        notify();
        return;
      }
      // No answer: kept on this device, it goes out when the Mac answers again.
      enqueue(r);
      remember(r);
      notify();
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    syncState: () => ({ pending: readQueue().length + (inflight > 0 && readQueue().length === 0 ? inflight : 0), lastOkMs }),
    handle(m) {
      if (m.type === 'records-changed') { if (m.profileId === profileId) notify(); return; }
      if (m.type === 'records' || m.type === 'records-put-result') waiting.get(m.requestId)?.settle(m);
    },
    opened() { void flush(); notify(); },
    closed() { for (const w of [...waiting.values()]) w.settle(null); },
    dispose() { disposed = true; subs.clear(); for (const w of [...waiting.values()]) w.settle(null); },
  };
}

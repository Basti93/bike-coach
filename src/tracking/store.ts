import type { TrackedRecord } from '../shared/records';
import type { PutResult, TrackingPort } from './ports';
import { ensureIds, finish, type FinishChoice, type FinishResult, type TrackedWorkout } from './session';

export type SaveState = 'saved' | 'unsaved';
export type StoreView = { workout: TrackedWorkout; save: SaveState };
export type FinishOutcome = Exclude<FinishResult, { status: 'finished' } | { status: 'discard' }> | { status: 'finished' | 'discard'; saved: boolean };

export type Draft = { pending: () => boolean; flush: () => void };

export const PUT_TIMEOUT_MS = 10_000;
export const RETRY_MS = 15_000;
const MAX_LOST_WRITES = 3;

const isRecord = (s: TrackedWorkout | TrackedRecord): s is TrackedRecord => 'kind' in s;

/**
 * One workout, saved action by action. The UI shows an action only after port.put has answered.
 * If put fails or does not answer in 10 s, the state stays in memory, `save` turns 'unsaved', and the next action (or a
 * retry every 15 s) writes everything again. updatedMs only ever goes up per record, seeded from the opened record,
 * so the newest edit wins whatever the clock does. Finish and discard decide on the same serial chain, against the
 * newest state, never against what is displayed.
 */
export function createWorkoutStore(port: TrackingPort, source: TrackedWorkout | TrackedRecord, now: () => number = Date.now) {
  const initial = ensureIds(isRecord(source) ? (source.body as TrackedWorkout) : source);
  let current = initial;
  let last = isRecord(source) ? source.updatedMs : 0;
  let deleted = false;
  let snapshot: StoreView = { workout: initial, save: 'saved' };
  let chain: Promise<unknown> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let closed = false;
  let pending = 0; // queued or in flight
  let everSaved = isRecord(source);
  const drafts = new Set<Draft>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  /** The version this store's state stands on: what it opened, took over, or last wrote. */
  let seen: number | undefined = isRecord(source) ? source.updatedMs : undefined;
  const putWithTimeout = (r: TrackedRecord): Promise<PutResult> => new Promise<PutResult>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), PUT_TIMEOUT_MS);
    port.put(r, { seenMs: seen }).then((res) => { clearTimeout(t); resolve(res); }, (e) => { clearTimeout(t); reject(e); });
  });

  /** Runs on the chain: writes the newest state. */
  async function writeNow(): Promise<boolean> {
    if (timer) { clearTimeout(timer); timer = null; }
    const w = current;
    last = Math.max(now(), last + 1);
    let ok = false;
    try {
      // A newer record stayed (the other device's clock runs ahead): the rider's state goes above it, never "saved" before that.
      for (let i = 0; i < MAX_LOST_WRITES && !ok; i++) {
        const res = await putWithTimeout({ kind: 'workout', id: w.id, updatedMs: last, deleted, body: w });
        ok = res.kept;
        // `seen` stays: the write above the winner is what tells the port it was not seen.
        if (!ok) { last = Math.max(now(), res.updatedMs + 1, last + 1); seen ??= 0; }
      }
    } catch { ok = false; }
    if (ok) { everSaved = true; seen = last; }
    snapshot = { workout: w, save: ok ? 'saved' : 'unsaved' };
    if (!ok && !disposed && !closed) timer = setTimeout(() => { timer = null; enqueue(writeNow); }, RETRY_MS);
    notify();
    return ok;
  }
  /** A delete is written once. If it fails, the workout stays live: the retry timer and later edits never carry the delete. */
  async function writeDeleted(): Promise<boolean> {
    deleted = true;
    const ok = await writeNow();
    deleted = false;
    return ok;
  }
  const isDirty = (): boolean => pending > 0 || snapshot.save === 'unsaved' || [...drafts].some((d) => d.pending());
  const dispose = (): void => { disposed = true; if (timer) { clearTimeout(timer); timer = null; } };

  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    pending++;
    const p = chain.then(job).finally(() => { pending--; });
    chain = p.catch(() => {});
    return p;
  }

  return {
    view: (): StoreView => snapshot,
    /** updatedMs of the newest write started here (or the opened record). A remote copy above it is newer. */
    updatedMs: (): number => last,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** Resolves true when saved. The change is applied to memory at once, so quick taps never overwrite each other. */
    apply(fn: (w: TrackedWorkout) => TrackedWorkout): Promise<boolean> {
      if (closed) return Promise.resolve(false);
      current = fn(current);
      return enqueue(writeNow);
    },
    /** The newest state, including changes whose save has not answered yet. Decide on this, not on the display. */
    current: (): TrackedWorkout => current,
    /** Anything queued, in flight, failed, or typed but not yet applied. Unsaved work on this device always wins. */
    dirty: isDirty,
    /** True once a write has gone through (or the workout was opened from a stored record). */
    everSaved: (): boolean => everSaved,
    registerDraft(d: Draft) { drafts.add(d); return () => { drafts.delete(d); }; },
    flushDrafts(): void { [...drafts].forEach((d) => d.flush()); },
    /** Finish or discard, decided against the newest state when its turn comes. Only asks, or saves what it decided. */
    finish(choice?: FinishChoice): Promise<FinishOutcome> {
      if (closed) return Promise.resolve({ status: 'finished' as const, saved: false });
      return enqueue(async () => {
        const r = finish(current, now(), choice);
        if (r.status === 'ask') return r;
        if (r.status === 'discard') return { status: 'discard' as const, saved: await writeDeleted() };
        current = r.workout;
        return { status: 'finished' as const, saved: await writeNow() };
      });
    },
    /** Writes a tombstone for a deliberate delete the person has confirmed. */
    remove(): Promise<boolean> { return closed ? Promise.resolve(false) : enqueue(writeDeleted); },
    /**
     * Takes a newer copy from elsewhere. Only a clean store replaces its state; with unsaved work the local state
     * stays and the clock floor is raised, so the next write lands above the remote copy.
     */
    reload(record: TrackedRecord): void {
      const raised = record.updatedMs > last;
      last = Math.max(last, record.updatedMs);
      if (closed) return;
      // A write already on its way was stamped below the remote copy: write again above it.
      if (isDirty()) { if (raised) void enqueue(writeNow); return; }
      // Older than what was written here (a list read that started before our last write): nothing to take over.
      if (record.updatedMs < last) return;
      current = ensureIds(record.body as TrackedWorkout);
      seen = record.updatedMs;
      snapshot = { workout: current, save: 'saved' };
      notify();
    },
    /** The workout is no longer ours (stepped aside): no more writes, nothing flushed. */
    close(): void { closed = true; dispose(); },
    dispose,
  };
}

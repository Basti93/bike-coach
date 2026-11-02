import type { TrackedRecord } from '../shared/records';
import type { TrackingPort } from './ports';
import { ensureIds, finish, type FinishChoice, type FinishResult, type TrackedWorkout } from './session';

export type SaveState = 'saved' | 'unsaved';
export type StoreView = { workout: TrackedWorkout; save: SaveState };
export type FinishOutcome = Exclude<FinishResult, { status: 'finished' } | { status: 'discard' }> | { status: 'finished' | 'discard'; saved: boolean };

export const PUT_TIMEOUT_MS = 10_000;
export const RETRY_MS = 15_000;

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
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const putWithTimeout = (r: TrackedRecord): Promise<void> => new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), PUT_TIMEOUT_MS);
    port.put(r).then(() => { clearTimeout(t); resolve(); }, (e) => { clearTimeout(t); reject(e); });
  });

  /** Runs on the chain: writes the newest state. */
  async function writeNow(): Promise<boolean> {
    if (timer) { clearTimeout(timer); timer = null; }
    const w = current;
    last = Math.max(now(), last + 1);
    let ok = true;
    try { await putWithTimeout({ kind: 'workout', id: w.id, updatedMs: last, deleted, body: w }); } catch { ok = false; }
    snapshot = { workout: w, save: ok ? 'saved' : 'unsaved' };
    if (!ok && !disposed) timer = setTimeout(() => { timer = null; enqueue(writeNow); }, RETRY_MS);
    notify();
    return ok;
  }
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const p = chain.then(job);
    chain = p.catch(() => {});
    return p;
  }

  return {
    view: (): StoreView => snapshot,
    /** updatedMs of the newest write started here (or the opened record). A remote copy above it is newer. */
    updatedMs: (): number => last,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** Resolves true when saved. The change is applied to memory at once, so quick taps never overwrite each other. */
    apply(fn: (w: TrackedWorkout) => TrackedWorkout): Promise<boolean> { current = fn(current); return enqueue(writeNow); },
    /** Finish or discard, decided against the newest state when its turn comes. Only asks, or saves what it decided. */
    finish(choice?: FinishChoice): Promise<FinishOutcome> {
      return enqueue(async () => {
        const r = finish(current, now(), choice);
        if (r.status === 'ask') return r;
        if (r.status === 'discard') { deleted = true; return { status: 'discard' as const, saved: await writeNow() }; }
        current = r.workout;
        return { status: 'finished' as const, saved: await writeNow() };
      });
    },
    /** Writes a tombstone for a deliberate delete the person has confirmed. */
    remove(): Promise<boolean> { return enqueue(() => { deleted = true; return writeNow(); }); },
    /** Takes a newer copy from elsewhere and continues from it. */
    reload(record: TrackedRecord): void {
      current = ensureIds(record.body as TrackedWorkout);
      last = Math.max(last, record.updatedMs);
      snapshot = { workout: current, save: 'saved' };
      notify();
    },
    dispose(): void { disposed = true; if (timer) { clearTimeout(timer); timer = null; } },
  };
}

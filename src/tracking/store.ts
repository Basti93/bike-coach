import type { TrackingPort } from './ports';
import type { TrackedWorkout } from './session';

export type SaveState = 'saved' | 'unsaved';
export type StoreView = { workout: TrackedWorkout; save: SaveState };

/**
 * One workout, saved action by action. The UI shows an action only after port.put has answered.
 * If put fails, the state stays in memory, `save` turns 'unsaved', and the next action writes everything again.
 */
export function createWorkoutStore(port: TrackingPort, initial: TrackedWorkout, now: () => number = Date.now) {
  let current = initial;
  let snapshot: StoreView = { workout: initial, save: 'saved' };
  let chain: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  const write = (deleted: boolean): Promise<boolean> => {
    const job = chain.then(async () => {
      const w = current;
      let ok = true;
      try { await port.put({ kind: 'workout', id: w.id, updatedMs: now(), deleted, body: w }); } catch { ok = false; }
      snapshot = { workout: w, save: ok ? 'saved' : 'unsaved' };
      listeners.forEach((l) => l());
      return ok;
    });
    chain = job;
    return job;
  };

  return {
    view: (): StoreView => snapshot,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** Resolves true when saved. The change is applied to memory at once, so quick taps never overwrite each other. */
    apply(fn: (w: TrackedWorkout) => TrackedWorkout): Promise<boolean> { current = fn(current); return write(false); },
    /** Writes a tombstone. */
    remove(): Promise<boolean> { return write(true); },
  };
}

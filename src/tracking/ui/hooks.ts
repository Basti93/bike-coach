import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Exercise } from '../../shared/exercises';
import { EXERCISES } from '../../shared/exercises';
import type { LoggedWorkout, RecordKind, TrackedRecord } from '../../shared/records';
import type { TrackingPort } from '../ports';
import type { createWorkoutStore, StoreView } from '../store';

export type WorkoutStore = ReturnType<typeof createWorkoutStore>;

/** Live records of one kind, null until the first answer. Tombstones are already filtered out. */
export function usePortRecords(port: TrackingPort, kind: RecordKind): TrackedRecord[] | null {
  const [records, setRecords] = useState<TrackedRecord[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => { port.list(kind).then((r) => { if (alive) setRecords(r.filter((x) => !x.deleted)); }, () => { if (alive) setRecords((c) => c ?? []); }); };
    load();
    const off = port.subscribe(load);
    return () => { alive = false; off(); };
  }, [port, kind]);
  return records;
}

export const finishedWorkouts = (records: TrackedRecord[] | null): LoggedWorkout[] =>
  (records ?? []).map((r) => r.body as LoggedWorkout).filter((w) => w.endMs !== null).sort((a, b) => (b.endMs ?? 0) - (a.endMs ?? 0));

/** Own list plus the person's own exercises; an own record with the same id wins. */
export function useCatalog(port: TrackingPort): Exercise[] {
  const own = usePortRecords(port, 'exercise');
  return useMemo(() => {
    const mine = (own ?? []).map((r) => r.body as Exercise);
    const ids = new Set(mine.map((e) => e.id));
    return [...EXERCISES.filter((e) => !ids.has(e.id)), ...mine];
  }, [own]);
}

export function useStoreView(store: WorkoutStore): StoreView {
  return useSyncExternalStore(store.subscribe, store.view);
}

/** Keeps the screen on while active, where the browser allows it. Errors are ignored. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let sentinel: { release(): Promise<void> } | null = null;
    const request = async () => {
      try { sentinel = (await (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen')) ?? null; } catch { /* not allowed, fine */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void request(); };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      try { void sentinel?.release().catch(() => {}); } catch { /* ignore */ }
    };
  }, [active]);
}

/** Re-renders every second while active, so the rest timer counts down. */
export function useTick(active: boolean): void {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

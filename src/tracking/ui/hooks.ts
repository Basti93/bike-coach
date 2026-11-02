import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Exercise } from '../../shared/exercises';
import { EXERCISES } from '../../shared/exercises';
import type { LoggedWorkout, RecordKind, TrackedRecord } from '../../shared/records';
import type { TrackingPort } from '../ports';
import type { createWorkoutStore, StoreView } from '../store';

export type WorkoutStore = ReturnType<typeof createWorkoutStore>;

export type PortRecords = { records: TrackedRecord[] | null; failed: boolean; retry: () => void };

/** Live records of one kind, null until the first answer. Tombstones are already filtered out. A failed first read is `failed`, with a retry. */
export function usePortRecords(port: TrackingPort, kind: RecordKind): PortRecords {
  const [records, setRecords] = useState<TrackedRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      port.list(kind).then(
        (r) => { if (alive) { setRecords(r.filter((x) => !x.deleted)); setFailed(false); } },
        () => { if (alive) setFailed(true); },
      );
    };
    load();
    const off = port.subscribe(load);
    return () => { alive = false; off(); };
  }, [port, kind, attempt]);
  return { records, failed: failed && records === null, retry: () => setAttempt((n) => n + 1) };
}

export const finishedWorkouts = (records: TrackedRecord[] | null): LoggedWorkout[] =>
  (records ?? []).map((r) => r.body as LoggedWorkout).filter((w) => w.endMs !== null).sort((a, b) => (b.endMs ?? 0) - (a.endMs ?? 0));

/** Own list plus the person's own exercises; an own record with the same id wins. */
export function useCatalog(port: TrackingPort): Exercise[] {
  const own = usePortRecords(port, 'exercise').records;
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
    let cancelled = false;
    const release = (s: { release(): Promise<void> } | null) => { try { void s?.release().catch(() => {}); } catch { /* ignore */ } };
    const request = async () => {
      try {
        const got = (await (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen')) ?? null;
        if (cancelled) release(got); // resolved after the screen was left
        else { release(sentinel); sentinel = got; }
      } catch { /* not allowed, fine */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void request(); };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      release(sentinel);
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

/** Text kept locally while typing, so a slow save never eats characters. Not overwritten from outside while focused. */
export function useDraft(value: string, commit: (text: string) => void, debounceMs = 0) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ draft, commit });
  latest.current = { draft, commit };
  const dirty = useRef(false);
  useEffect(() => { if (!focused.current && !dirty.current) setDraft(value); }, [value]);
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (dirty.current) { dirty.current = false; latest.current.commit(latest.current.draft); }
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    draft,
    onChange(text: string) {
      setDraft(text);
      latest.current = { draft: text, commit };
      dirty.current = true;
      if (debounceMs <= 0) flush();
      else { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(flush, debounceMs); }
    },
    onFocus() { focused.current = true; },
    onBlur() { focused.current = false; flush(); },
    setDraft,
  };
}

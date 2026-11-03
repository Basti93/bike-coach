import type { LoggedWorkout } from './records';

export type Span = { startMs: number; durationMs: number };

/** Two sessions are the same one when they overlap by at least half of the shorter. A session without length is a point. */
export function overlapsHalf(a: Span, b: Span): boolean {
  const da = a.durationMs > 0 ? a.durationMs : 0, db = b.durationMs > 0 ? b.durationMs : 0;
  const aEnd = a.startMs + da, bEnd = b.startMs + db;
  if (da === 0 || db === 0) {
    const [pt, other, otherEnd] = da === 0 ? [a.startMs, b.startMs, bEnd] : [b.startMs, a.startMs, aEnd];
    return pt >= other && (pt < otherEnd || pt === other);
  }
  const overlap = Math.min(aEnd, bEnd) - Math.max(a.startMs, b.startMs);
  return overlap > 0 && overlap >= Math.min(da, db) / 2;
}

const span = (w: LoggedWorkout): Span => ({ startMs: w.startMs, durationMs: (w.endMs ?? w.startMs) - w.startMs });

/** Finished sessions only. A Hevy session that overlaps an own one is the same performed session: own wins. Newest first. */
export function dedupeSessions(all: LoggedWorkout[]): LoggedWorkout[] {
  const finished = all.filter((w) => w.endMs !== null);
  const own = finished.filter((w) => w.source !== 'hevy');
  return finished
    .filter((w) => w.source !== 'hevy' || !own.some((o) => overlapsHalf(span(o), span(w))))
    .sort((a, b) => (b.endMs ?? 0) - (a.endMs ?? 0));
}

const doneCount = (w: LoggedWorkout): number => w.exercises.flatMap((e) => e.sets).filter((s) => s.doneMs !== null).length;

/**
 * For anything that counts training: a session known as a record and as kept copies counts once, in the version with
 * the most confirmed sets. The history list still shows them all, so the person can see and delete a copy.
 */
export function onePerSession<T extends LoggedWorkout>(all: T[]): T[] {
  const best = new Map<string, T>();
  for (const w of all) {
    const key = w.keptCopyOf ?? w.id;
    const have = best.get(key);
    if (!have || doneCount(w) > doneCount(have)) best.set(key, w);
  }
  return all.filter((w) => best.get(w.keptCopyOf ?? w.id) === w);
}

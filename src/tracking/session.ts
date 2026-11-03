import type { Exercise } from '../shared/exercises';
import { EXERCISES } from '../shared/exercises';
import { dedupeSessions, onePerSession } from '../shared/history';
import type { LoggedExercise, LoggedSet, LoggedWorkout } from '../shared/records';
import type { GymExercise, GymWorkout } from '../coach/gym/types';

/** Pure workout logic. No browser, Node or Electron APIs, so the Mac app and the web app share it. */
export type TrackedSet = LoggedSet & { rid: string; repRange?: { start: number; end: number } };
export type TrackedExercise = Omit<LoggedExercise, 'sets'> & { rid: string; sets: TrackedSet[]; restS?: number | null; timed?: boolean };
/** Stored as the record body. `rest` keeps the timer start, so a reload continues it. Rows have stable ids (`rid`). */
export type TrackedWorkout = Omit<LoggedWorkout, 'exercises'> & { exercises: TrackedExercise[]; rest?: { startMs: number; durationS: number } | null };

export const DEFAULT_REST_S = 90;
export const STALE_OPEN_MS = 6 * 3_600_000;
export type FinishChoice = 'complete' | 'omit' | 'discard';
export type FinishResult =
  | { status: 'ask'; question: 'nothing-confirmed' }
  | { status: 'ask'; question: 'open-sets'; open: number }
  | { status: 'finished'; workout: TrackedWorkout }
  | { status: 'discard' };

export const isTimed = (type: string): boolean => type.includes('duration');
const isDone = (s: LoggedSet): boolean => s.doneMs !== null;

let counter = 0;
const newRid = (): string => `r${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Records from before row ids existed get them once; a workout that has them is returned as it is. */
export function ensureIds(w: Omit<TrackedWorkout, 'exercises'> & { exercises: (Omit<TrackedExercise, 'rid' | 'sets'> & { rid?: string; sets: (Omit<TrackedSet, 'rid'> & { rid?: string })[] })[] }): TrackedWorkout {
  if (w.exercises.every((e) => e.rid && e.sets.every((s) => s.rid))) return w as TrackedWorkout;
  return { ...w, exercises: w.exercises.map((e) => ({ ...e, rid: e.rid ?? newRid(), sets: e.sets.map((s) => ({ ...s, rid: s.rid ?? newRid() })) })) };
}

/** Comma or dot. '' is empty (null), unreadable text is undefined so the caller keeps the old value. */
export function parseDecimal(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
export const formatDecimal = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','));

/** Confirmed sets of the newest performed session containing the exercise. A session known twice (own and Hevy) counts once. */
export function lastValues(exerciseId: string, history: LoggedWorkout[]): LoggedSet[] {
  for (const w of onePerSession(dedupeSessions(history))) {
    const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter(isDone));
    if (sets.length) return sets;
  }
  return [];
}

const blank = (): TrackedSet => ({ rid: newRid(), type: 'normal', weightKg: null, reps: null, durationS: null, doneMs: null });
const typeOf = (id: string, catalog: Exercise[]): string => catalog.find((e) => e.id === id)?.type ?? 'weight_reps';

function plannedExercise(g: GymExercise, history: LoggedWorkout[], catalog: Exercise[]): TrackedExercise {
  const last = lastValues(g.templateId, history);
  const timed = isTimed(typeOf(g.templateId, catalog));
  const seen = { warm: 0, work: 0 };
  const sets = g.sets.map((p): TrackedSet => {
    // A warmup only ever prefills a warmup, a working set only a working set.
    const warm = p.type === 'warmup';
    const pool = last.filter((l) => (l.type === 'warmup') === warm);
    const i = warm ? seen.warm++ : seen.work++;
    const l = pool[i] ?? pool[pool.length - 1];
    return {
      rid: newRid(), type: p.type,
      weightKg: p.weightKg ?? l?.weightKg ?? null,
      reps: p.reps ?? (p.repRange ? p.repRange.start : null) ?? l?.reps ?? null,
      durationS: l?.durationS ?? null, doneMs: null,
      ...(p.repRange ? { repRange: p.repRange } : {}),
    };
  });
  return { rid: newRid(), exerciseId: g.templateId, title: g.title, supersetId: g.supersetId, notes: g.notes, sets, restS: g.restS, ...(timed ? { timed } : {}) };
}

export function startFromPlan(w: GymWorkout, history: LoggedWorkout[], nowMs: number, id: string, catalog: Exercise[] = EXERCISES): TrackedWorkout {
  return { id, title: w.name, startMs: nowMs, endMs: null, source: 'pandafit', exercises: w.exercises.map((g) => plannedExercise(g, history, catalog)), rest: null };
}
export const startFromRoutine = startFromPlan;
export const startEmpty = (nowMs: number, id: string, title = 'Training'): TrackedWorkout =>
  ({ id, title, startMs: nowMs, endMs: null, source: 'pandafit', exercises: [], rest: null });

function fromCatalog(e: Exercise, history: LoggedWorkout[], keep?: Pick<TrackedExercise, 'supersetId' | 'restS'>): TrackedExercise {
  const last = lastValues(e.id, history);
  const sets: TrackedSet[] = last.length
    ? last.map((l) => ({ rid: newRid(), type: l.type, weightKg: l.weightKg, reps: l.reps, durationS: l.durationS, doneMs: null }))
    : [blank()];
  return { rid: newRid(), exerciseId: e.id, title: e.title, supersetId: keep?.supersetId ?? null, notes: '', sets, ...(keep?.restS !== undefined ? { restS: keep.restS } : {}), ...(isTimed(e.type) ? { timed: true } : {}) };
}

/** Applies f to the exercise with that row id. An unknown id (a stale tap) changes nothing and returns the same object. */
function mapEx(w: TrackedWorkout, rid: string, f: (e: TrackedExercise) => TrackedExercise): TrackedWorkout {
  if (!w.exercises.some((e) => e.rid === rid)) return w;
  return { ...w, exercises: w.exercises.map((e) => (e.rid === rid ? f(e) : e)) };
}
function mapSet(w: TrackedWorkout, ex: string, set: string, f: (s: TrackedSet) => TrackedSet): TrackedWorkout {
  if (!w.exercises.find((e) => e.rid === ex)?.sets.some((s) => s.rid === set)) return w;
  return mapEx(w, ex, (x) => ({ ...x, sets: x.sets.map((s) => (s.rid === set ? f(s) : s)) }));
}

export function confirmSet(w: TrackedWorkout, ex: string, set: string, nowMs: number): TrackedWorkout {
  const e = w.exercises.find((x) => x.rid === ex);
  const next = mapSet(w, ex, set, (s) => ({ ...s, doneMs: nowMs }));
  return next === w ? w : { ...next, rest: { startMs: nowMs, durationS: e?.restS ?? DEFAULT_REST_S } };
}
export function unconfirmSet(w: TrackedWorkout, ex: string, set: string): TrackedWorkout {
  const next = mapSet(w, ex, set, (s) => ({ ...s, doneMs: null }));
  return next === w ? w : { ...next, rest: null };
}
export const editSet = (w: TrackedWorkout, ex: string, set: string, patch: Partial<Pick<TrackedSet, 'weightKg' | 'reps' | 'durationS' | 'type'>>): TrackedWorkout =>
  mapSet(w, ex, set, (s) => ({ ...s, ...patch }));
export const editNotes = (w: TrackedWorkout, ex: string, notes: string): TrackedWorkout => mapEx(w, ex, (x) => ({ ...x, notes }));
export const addSet = (w: TrackedWorkout, ex: string): TrackedWorkout =>
  mapEx(w, ex, (x) => {
    const l = x.sets[x.sets.length - 1];
    return { ...x, sets: [...x.sets, l ? { ...l, rid: newRid(), doneMs: null } : blank()] };
  });
export const removeSet = (w: TrackedWorkout, ex: string, set: string): TrackedWorkout =>
  mapSet(w, ex, set, (s) => s) === w ? w : mapEx(w, ex, (x) => ({ ...x, sets: x.sets.filter((s) => s.rid !== set) }));
export const addExercise = (w: TrackedWorkout, e: Exercise, history: LoggedWorkout[]): TrackedWorkout =>
  ({ ...w, exercises: [...w.exercises, fromCatalog(e, history)] });
export const removeExercise = (w: TrackedWorkout, ex: string): TrackedWorkout =>
  w.exercises.some((e) => e.rid === ex) ? { ...w, exercises: w.exercises.filter((e) => e.rid !== ex) } : w;

/** What really happened counts: confirmed sets stay with the old exercise, the rest moves to the new one. */
export function swapExercise(w: TrackedWorkout, ex: string, e: Exercise, history: LoggedWorkout[]): TrackedWorkout {
  const i = w.exercises.findIndex((x) => x.rid === ex);
  if (i < 0) return w;
  const old = w.exercises[i];
  const doneSets = old.sets.filter(isDone);
  const fresh = fromCatalog(e, history, old);
  const exercises = [...w.exercises];
  exercises.splice(i, 1, ...(doneSets.length ? [{ ...old, sets: doneSets }, fresh] : [fresh]));
  return { ...w, exercises };
}

export const restRemainingS = (w: TrackedWorkout, nowMs: number): number =>
  w.rest ? Math.max(0, Math.ceil((w.rest.startMs + w.rest.durationS * 1000 - nowMs) / 1000)) : 0;

/**
 * Asks before anything is dropped. 'discard' only works when no set is confirmed; otherwise it is ignored and the
 * normal question comes. A workout whose last confirmed set is over 6 hours old ends at that set, not now.
 */
export function finish(w: TrackedWorkout, nowMs: number, choice?: FinishChoice): FinishResult {
  const sets = w.exercises.flatMap((e) => e.sets);
  const doneTimes = sets.filter(isDone).map((s) => s.doneMs as number);
  const confirmed = doneTimes.length;
  const open = sets.length - confirmed;
  if (choice === 'discard' && confirmed > 0) choice = undefined;
  if (confirmed === 0 && choice !== 'complete') {
    return choice === 'discard' ? { status: 'discard' } : { status: 'ask', question: 'nothing-confirmed' };
  }
  if (open > 0 && !choice) return { status: 'ask', question: 'open-sets', open };
  const last = confirmed ? Math.max(...doneTimes) : null;
  const endMs = last !== null && nowMs - last > STALE_OPEN_MS ? last : nowMs;
  const exercises = choice === 'complete'
    ? w.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => (isDone(s) ? s : { ...s, doneMs: endMs })) }))
    : w.exercises;
  return { status: 'finished', workout: { ...w, exercises, endMs, rest: null } };
}

/** A running time: "1:39", past an hour "1:02:05". */
export function durationLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

import type { Exercise } from '../shared/exercises';
import { EXERCISES } from '../shared/exercises';
import type { LoggedExercise, LoggedSet, LoggedWorkout } from '../shared/records';
import type { GymExercise, GymWorkout } from '../coach/gym/types';

/** Pure workout logic. No browser, Node or Electron APIs, so the Mac app and the web app share it. */
export type TrackedSet = LoggedSet & { repRange?: { start: number; end: number } };
export type TrackedExercise = Omit<LoggedExercise, 'sets'> & { sets: TrackedSet[]; restS?: number | null; timed?: boolean };
/** Stored as the record body. `rest` keeps the timer start, so a reload continues it. */
export type TrackedWorkout = Omit<LoggedWorkout, 'exercises'> & { exercises: TrackedExercise[]; rest?: { startMs: number; durationS: number } | null };

export const DEFAULT_REST_S = 90;
export type FinishChoice = 'complete' | 'omit' | 'discard';
export type FinishResult =
  | { status: 'ask'; question: 'nothing-confirmed' }
  | { status: 'ask'; question: 'open-sets'; open: number }
  | { status: 'finished'; workout: TrackedWorkout }
  | { status: 'discard' };

export const isTimed = (type: string): boolean => type.includes('duration');
const isDone = (s: LoggedSet): boolean => s.doneMs !== null;

/** Comma or dot. '' is empty (null), unreadable text is undefined so the caller keeps the old value. */
export function parseDecimal(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
export const formatDecimal = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','));

/** Confirmed sets of the newest finished workout containing the exercise. */
export function lastValues(exerciseId: string, history: LoggedWorkout[]): LoggedSet[] {
  let best: LoggedWorkout | null = null;
  for (const w of history) {
    if (w.endMs === null || !w.exercises.some((e) => e.exerciseId === exerciseId && e.sets.some(isDone))) continue;
    if (!best || w.endMs > (best.endMs ?? 0)) best = w;
  }
  if (!best) return [];
  return best.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter(isDone));
}

const blank = (): TrackedSet => ({ type: 'normal', weightKg: null, reps: null, durationS: null, doneMs: null });
const typeOf = (id: string, catalog: Exercise[]): string => catalog.find((e) => e.id === id)?.type ?? 'weight_reps';

function plannedExercise(g: GymExercise, history: LoggedWorkout[], catalog: Exercise[]): TrackedExercise {
  const last = lastValues(g.templateId, history);
  const timed = isTimed(typeOf(g.templateId, catalog));
  const sets = g.sets.map((p, i): TrackedSet => {
    const l = last[i] ?? last[last.length - 1];
    return {
      type: p.type,
      weightKg: p.weightKg ?? l?.weightKg ?? null,
      reps: p.reps ?? (p.repRange ? p.repRange.start : null) ?? l?.reps ?? null,
      durationS: l?.durationS ?? null,
      doneMs: null,
      ...(p.repRange ? { repRange: p.repRange } : {}),
    };
  });
  return { exerciseId: g.templateId, title: g.title, supersetId: g.supersetId, notes: g.notes, sets, restS: g.restS, ...(timed ? { timed } : {}) };
}

export function startFromPlan(w: GymWorkout, history: LoggedWorkout[], nowMs: number, id: string, catalog: Exercise[] = EXERCISES): TrackedWorkout {
  return { id, title: w.name, startMs: nowMs, endMs: null, source: 'pandafit', exercises: w.exercises.map((g) => plannedExercise(g, history, catalog)), rest: null };
}
export const startFromRoutine = startFromPlan;
export const startEmpty = (nowMs: number, id: string, title = 'Training'): TrackedWorkout =>
  ({ id, title, startMs: nowMs, endMs: null, source: 'pandafit', exercises: [], rest: null });

function fromCatalog(e: Exercise, history: LoggedWorkout[], keep?: Pick<TrackedExercise, 'supersetId' | 'notes'>): TrackedExercise {
  const last = lastValues(e.id, history);
  const sets: TrackedSet[] = last.length
    ? last.map((l) => ({ type: l.type, weightKg: l.weightKg, reps: l.reps, durationS: l.durationS, doneMs: null }))
    : [blank()];
  return { exerciseId: e.id, title: e.title, supersetId: keep?.supersetId ?? null, notes: keep?.notes ?? '', sets, ...(isTimed(e.type) ? { timed: true } : {}) };
}

const mapEx = (w: TrackedWorkout, i: number, f: (e: TrackedExercise) => TrackedExercise): TrackedWorkout =>
  ({ ...w, exercises: w.exercises.map((e, k) => (k === i ? f(e) : e)) });

export function confirmSet(w: TrackedWorkout, ex: number, set: number, nowMs: number): TrackedWorkout {
  const e = w.exercises[ex];
  return { ...mapEx(w, ex, (x) => ({ ...x, sets: x.sets.map((s, k) => (k === set ? { ...s, doneMs: nowMs } : s)) })), rest: { startMs: nowMs, durationS: e.restS ?? DEFAULT_REST_S } };
}
export const unconfirmSet = (w: TrackedWorkout, ex: number, set: number): TrackedWorkout =>
  ({ ...mapEx(w, ex, (x) => ({ ...x, sets: x.sets.map((s, k) => (k === set ? { ...s, doneMs: null } : s)) })), rest: null });
export const editSet = (w: TrackedWorkout, ex: number, set: number, patch: Partial<Pick<TrackedSet, 'weightKg' | 'reps' | 'durationS' | 'type'>>): TrackedWorkout =>
  mapEx(w, ex, (x) => ({ ...x, sets: x.sets.map((s, k) => (k === set ? { ...s, ...patch } : s)) }));
export const editNotes = (w: TrackedWorkout, ex: number, notes: string): TrackedWorkout => mapEx(w, ex, (x) => ({ ...x, notes }));
export const addSet = (w: TrackedWorkout, ex: number): TrackedWorkout =>
  mapEx(w, ex, (x) => {
    const l = x.sets[x.sets.length - 1];
    return { ...x, sets: [...x.sets, l ? { ...l, doneMs: null } : blank()] };
  });
export const removeSet = (w: TrackedWorkout, ex: number, set: number): TrackedWorkout =>
  mapEx(w, ex, (x) => ({ ...x, sets: x.sets.filter((_, k) => k !== set) }));
export const addExercise = (w: TrackedWorkout, e: Exercise, history: LoggedWorkout[]): TrackedWorkout =>
  ({ ...w, exercises: [...w.exercises, fromCatalog(e, history)] });
export const removeExercise = (w: TrackedWorkout, ex: number): TrackedWorkout =>
  ({ ...w, exercises: w.exercises.filter((_, k) => k !== ex) });

/** What really happened counts: confirmed sets stay with the old exercise, the rest moves to the new one. */
export function swapExercise(w: TrackedWorkout, ex: number, e: Exercise, history: LoggedWorkout[]): TrackedWorkout {
  const old = w.exercises[ex];
  const doneSets = old.sets.filter(isDone);
  const fresh = fromCatalog(e, history, old);
  const exercises = [...w.exercises];
  exercises.splice(ex, 1, ...(doneSets.length ? [{ ...old, sets: doneSets }, fresh] : [fresh]));
  return { ...w, exercises };
}

export const restRemainingS = (w: TrackedWorkout, nowMs: number): number =>
  w.rest ? Math.max(0, Math.ceil((w.rest.startMs + w.rest.durationS * 1000 - nowMs) / 1000)) : 0;

/** Asks before anything is dropped. 'discard' only answers the nothing-confirmed question; the caller writes the tombstone. */
export function finish(w: TrackedWorkout, nowMs: number, choice?: FinishChoice): FinishResult {
  const sets = w.exercises.flatMap((e) => e.sets);
  const confirmed = sets.filter(isDone).length;
  const open = sets.length - confirmed;
  if (confirmed === 0 && choice !== 'complete') {
    return choice === 'discard' ? { status: 'discard' } : { status: 'ask', question: 'nothing-confirmed' };
  }
  if (open > 0 && !choice) return { status: 'ask', question: 'open-sets', open };
  const exercises = choice === 'complete'
    ? w.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => (isDone(s) ? s : { ...s, doneMs: nowMs })) }))
    : w.exercises;
  return { status: 'finished', workout: { ...w, exercises, endMs: nowMs, rest: null } };
}

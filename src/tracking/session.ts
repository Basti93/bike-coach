import { EXERCISES, exerciseTitles, type Exercise } from '../shared/exercises';
import { defaultStudio, mainStudio, studioName, studioKey, resolveStudio, NO_STUDIOS, type StudioState } from '../shared/studio';
import { dedupeSessions, onePerSession } from '../shared/history';
import type { Effort, LoggedExercise, LoggedSet, LoggedWorkout } from '../shared/records';
import { ladderFrom, snapDown, type LoadStepOverrides } from '../shared/loads';
import { applyNextChanges, LIGHTER_PCT, listedIds, type NextChange } from '../shared/changes';
import type { GymExercise, GymWorkout } from '../coach/gym/types';

/** Pure workout logic. No browser, Node or Electron APIs, so the Mac app and the web app share it. */
/** `plannedReps`: the reps the plan asked for, kept when the rider edits `reps`. */
export type TrackedSet = LoggedSet & { rid: string; repRange?: { start: number; end: number }; plannedReps?: number };
export type TrackedExercise = Omit<LoggedExercise, 'sets'> & { rid: string; sets: TrackedSet[]; restS?: number | null; timed?: boolean; swappedIn?: true };
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

/** The studio bucket a workout counts for: its own, else the default studio, else the main one, else the shared bucket (''). */
export function hereKey(w: { studio?: string }, history: readonly LoggedWorkout[], studios: StudioState = NO_STUDIOS): string {
  return (w.studio ? resolveStudio(w.studio, studios.renames) : undefined) ?? defaultStudio(history, studios.renames, studios.picks) ?? mainStudio(history, studios.renames) ?? '';
}

/**
 * The last done sets of an exercise; an own exercise also finds sets logged in Hevy under its titles. A session known twice
 * (own and Hevy, record and kept copy) counts once. Sessions of the studio `studio` (a bucket key; default: the default
 * studio) come first, so weights never come from another studio's machines; only without any history there, all studios count.
 */
export function lastValues(exerciseId: string, history: LoggedWorkout[], catalog?: Exercise[], studio?: string, studios: StudioState = NO_STUDIOS): LoggedSet[] {
  const own = (catalog ?? EXERCISES).find((e) => e.id === exerciseId);
  const titles = own ? exerciseTitles(own) : [];
  const key = studio ?? hereKey({}, history, studios);
  const main = mainStudio(history, studios.renames);
  const sessions = onePerSession(dedupeSessions(history));
  const setsOf = (w: LoggedWorkout): LoggedSet[] => w.exercises.filter((e) => e.exerciseId === exerciseId || titles.includes(e.title)).flatMap((e) => e.sets.filter(isDone));
  for (const pool of [sessions.filter((w) => studioKey(w, main, studios.renames) === key), sessions]) {
    for (const w of pool) {
      const sets = setsOf(w);
      if (sets.length) return sets;
    }
  }
  return [];
}

const blank = (): TrackedSet => ({ rid: newRid(), type: 'normal', weightKg: null, reps: null, durationS: null, doneMs: null });
const typeOf = (id: string, catalog: Exercise[]): string => catalog.find((e) => e.id === id)?.type ?? 'weight_reps';

function plannedExercise(g: GymExercise, history: LoggedWorkout[], catalog: Exercise[], studio?: string, studios: StudioState = NO_STUDIOS): TrackedExercise {
  const last = lastValues(g.templateId, history, catalog, studio, studios);
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
      ...(p.reps !== null && p.reps !== undefined ? { plannedReps: p.reps } : {}),
    };
  });
  return { rid: newRid(), exerciseId: g.templateId, title: g.title, supersetId: g.supersetId, notes: g.notes, sets, restS: g.restS, ...(timed ? { timed } : {}) };
}

/**
 * `next`: the changes for this workout that are `taken` (see shared/changes). Applied oldest first, except those a workout
 * already lists (`workouts`, any, open or finished): a second start never applies one twice. The new workout lists each applied
 * change with empty rows, so there is no undo after the start, and a skipped op leaves a short line in the first exercise's notes.
 */
export function startFromPlan(w: GymWorkout, history: LoggedWorkout[], nowMs: number, id: string, catalog: Exercise[] = EXERCISES, studio?: string, studios: StudioState = NO_STUDIOS, next: { changes: NextChange[]; workouts: LoggedWorkout[]; overrides?: LoadStepOverrides } = { changes: [], workouts: [] }): TrackedWorkout {
  const listed = listedIds(next.workouts);
  const todo = next.changes.filter((c) => c.state === 'taken' && !listed.has(c.id));
  // A lowered weight lands on a weight the machine here can really show: the exercise's ladder in this workout's studio.
  const key = hereKey({ studio }, history, studios);
  const main = mainStudio(history, studios.renames);
  const sessions = onePerSession(dedupeSessions([...history]));
  const lower = (exerciseId: string, kg: number): number => {
    const equipment = catalog.find((e) => e.id === exerciseId)?.equipment ?? '';
    const own = sessions.map((h) => ({ studio: h.studio, startMs: h.startMs, sets: h.exercises.filter((x) => x.exerciseId === exerciseId).flatMap((x) => x.sets.filter(isDone)) }));
    return snapDown(kg, ladderFrom(own, { exerciseId, studio: key, main, renames: studios.renames }, equipment, next.overrides ?? new Map()).ladder);
  };
  const { plan, notes } = applyNextChanges(w, todo, catalog, lower);
  const exercises = plan.exercises.map((g) => plannedExercise(g, history, catalog, studio, studios));
  // Lighter also works on weights the last session gave (the plan had none); planned weights were lightened above.
  for (const c of todo) for (const o of c.ops) {
    const g = o.op === 'lighter' ? plan.exercises.findIndex((x) => x.templateId === o.exerciseId) : -1;
    if (g >= 0) exercises[g] = { ...exercises[g]!, sets: exercises[g]!.sets.map((x, k) => (plan.exercises[g]!.sets[k]?.weightKg === null && x.weightKg !== null ? { ...x, weightKg: lower(o.exerciseId, x.weightKg * (1 - LIGHTER_PCT / 100)) } : x)) };
  }
  if (notes.length && exercises[0]) exercises[0] = { ...exercises[0], notes: [exercises[0].notes, ...notes].filter(Boolean).join('\n') };
  const changes = todo.map((c) => ({ id: c.id, atMs: nowMs, prior: [], pos: [], after: [] }));
  return { id, title: plan.name, startMs: nowMs, endMs: null, source: 'pandafit', exercises, rest: null, ...(changes.length ? { changes } : {}) };
}
/** Sets (or, with an empty name, clears) the studio. */
export function setStudio(w: TrackedWorkout, raw: string): TrackedWorkout {
  const { studio: _old, ...rest } = w;
  const studio = studioName(raw);
  return studio ? { ...rest, studio } : rest;
}
export const startFromRoutine = startFromPlan;
export const startEmpty = (nowMs: number, id: string, title = 'Training'): TrackedWorkout =>
  ({ id, title, startMs: nowMs, endMs: null, source: 'pandafit', exercises: [], rest: null });

function fromCatalog(e: Exercise, history: LoggedWorkout[], studio: string, keep?: Pick<TrackedExercise, 'supersetId' | 'restS'>, studios: StudioState = NO_STUDIOS): TrackedExercise {
  const last = lastValues(e.id, history, [e], studio, studios);
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
  if (next === w) return w;
  // In a superset the rest comes after the last exercise of the round: none while a later one of the group still has an open set.
  const i = next.exercises.findIndex((x) => x.rid === ex);
  const group = e?.supersetId ?? null;
  const goOn = group !== null && next.exercises.slice(i + 1).some((x) => x.supersetId === group && x.sets.some((s) => s.doneMs === null));
  return { ...next, rest: goOn ? null : { startMs: nowMs, durationS: e?.restS ?? DEFAULT_REST_S } };
}
export function unconfirmSet(w: TrackedWorkout, ex: string, set: string): TrackedWorkout {
  const next = mapSet(w, ex, set, (s) => ({ ...s, doneMs: null }));
  return next === w ? w : { ...next, rest: null };
}
export const editSet = (w: TrackedWorkout, ex: string, set: string, patch: Partial<Pick<TrackedSet, 'weightKg' | 'reps' | 'durationS' | 'type'>>): TrackedWorkout =>
  mapSet(w, ex, set, (s) => ({ ...s, ...patch }));
export const setEffort = (w: TrackedWorkout, ex: string, effort: Effort | 'skip'): TrackedWorkout => mapEx(w, ex, (x) => ({ ...x, effort }));
export const editNotes = (w: TrackedWorkout, ex: string, notes: string): TrackedWorkout => mapEx(w, ex, (x) => ({ ...x, notes }));
export const addSet = (w: TrackedWorkout, ex: string): TrackedWorkout =>
  mapEx(w, ex, (x) => {
    const l = x.sets[x.sets.length - 1];
    return { ...x, sets: [...x.sets, l ? { ...l, rid: newRid(), doneMs: null } : blank()] };
  });
export const removeSet = (w: TrackedWorkout, ex: string, set: string): TrackedWorkout =>
  mapSet(w, ex, set, (s) => s) === w ? w : mapEx(w, ex, (x) => ({ ...x, sets: x.sets.filter((s) => s.rid !== set) }));
export const addExercise = (w: TrackedWorkout, e: Exercise, history: LoggedWorkout[], studios: StudioState = NO_STUDIOS): TrackedWorkout =>
  ({ ...w, exercises: [...w.exercises, fromCatalog(e, history, hereKey(w, history, studios), undefined, studios)] });
export const removeExercise = (w: TrackedWorkout, ex: string): TrackedWorkout =>
  w.exercises.some((e) => e.rid === ex) ? { ...w, exercises: w.exercises.filter((e) => e.rid !== ex) } : w;

/** What really happened counts: confirmed sets stay with the old exercise, the rest moves to the new one. */
export function swapExercise(w: TrackedWorkout, ex: string, e: Exercise, history: LoggedWorkout[], studios: StudioState = NO_STUDIOS): TrackedWorkout {
  const i = w.exercises.findIndex((x) => x.rid === ex);
  if (i < 0) return w;
  const old = w.exercises[i];
  const doneSets = old.sets.filter(isDone);
  const fresh: TrackedExercise = { ...fromCatalog(e, history, hereKey(w, history, studios), old, studios), swappedIn: true };
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
  // The undo data of a coach change is of no use once the workout is over; the ids stay (a second start must not apply them again).
  const changes = w.changes?.map((c) => ({ id: c.id, atMs: c.atMs, prior: [], pos: [], after: [] }));
  return { status: 'finished', workout: { ...w, exercises, endMs, rest: null, ...(changes ? { changes } : {}) } };
}

/** A running time: "1:39", past an hour "1:02:05". */
export function durationLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Joins an exercise with the next one in a superset; the next one joins this one's group, or both start a new group. */
export function linkSuperset(w: TrackedWorkout, ex: string): TrackedWorkout {
  const i = w.exercises.findIndex((x) => x.rid === ex);
  if (i < 0 || i + 1 >= w.exercises.length) return w;
  const a = w.exercises[i], b = w.exercises[i + 1];
  if (a.supersetId !== null && a.supersetId === b.supersetId) return w;
  const used = w.exercises.map((x) => x.supersetId ?? -1);
  const id = a.supersetId ?? b.supersetId ?? Math.max(-1, ...used) + 1;
  const from = b.supersetId; // b's old group moves along with it
  return { ...w, exercises: w.exercises.map((x, j) => (j === i || j === i + 1 || (from !== null && x.supersetId === from) ? { ...x, supersetId: id } : x)) };
}

/** Takes one exercise out of its superset; a group left with one exercise is dissolved. */
export function unlinkSuperset(w: TrackedWorkout, ex: string): TrackedWorkout {
  const e = w.exercises.find((x) => x.rid === ex);
  if (!e || e.supersetId === null) return w;
  const group = e.supersetId;
  const rest = w.exercises.filter((x) => x.rid !== ex && x.supersetId === group);
  return { ...w, exercises: w.exercises.map((x) => (x.rid === ex || (rest.length === 1 && x.supersetId === group) ? { ...x, supersetId: null } : x)) };
}

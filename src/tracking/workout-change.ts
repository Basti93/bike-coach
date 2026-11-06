import type { WorkoutChange, WorkoutOp } from '../shared/chat';
import type { Exercise } from '../shared/exercises';
import type { LoggedWorkout } from '../shared/records';
import { NO_STUDIOS, type StudioState } from '../shared/studio';
import type { WorkoutChangeEntry } from '../shared/records';
import { removeExercise, swapExercise, type TrackedWorkout } from './session';

const open = (w: TrackedWorkout, ex: string) => w.exercises.find((e) => e.rid === ex)?.sets.filter((s) => s.doneMs === null) ?? [];
const half = (kg: number) => Math.round(kg * 2) / 2;

/**
 * The ops that can apply to this workout (their row exists and still has open sets, a swap target is in the catalog)
 * and, for the others, one reason each in words.
 */
export function checkOps(change: WorkoutChange, w: TrackedWorkout, catalog: Exercise[]): { ops: WorkoutOp[]; reasons: string[] } {
  if (change.workoutId !== w.id || w.endMs !== null) return { ops: [], reasons: change.ops.length ? ['Training schon beendet'] : [] };
  const ops: WorkoutOp[] = [];
  const reasons: string[] = [];
  for (const o of change.ops) {
    if (open(w, o.ex).length === 0) reasons.push('Satz schon erledigt');
    else if (o.op === 'swap' && !catalog.some((e) => e.id === o.to)) reasons.push('Übung nicht im Katalog');
    else ops.push(o);
  }
  return { ops, reasons };
}

export const validOps = (change: WorkoutChange, w: TrackedWorkout, catalog: Exercise[]): WorkoutOp[] => checkOps(change, w, catalog).ops;

/** One line for the rider, or null when nothing was rejected. */
export const gehtNicht = (reasons: string[]): string | null => (reasons.length ? `Geht nicht: ${[...new Set(reasons)].join(', ')}.` : null);

/** Applies the valid ops in order. Done sets are never touched. */
export function applyWorkoutChange(w: TrackedWorkout, change: WorkoutChange, history: LoggedWorkout[], catalog: Exercise[], studios: StudioState = NO_STUDIOS): TrackedWorkout {
  let x = w;
  for (const o of validOps(change, w, catalog)) {
    const e = x.exercises.find((y) => y.rid === o.ex);
    if (!e) continue;
    if (o.op === 'drop') {
      x = e.sets.some((s) => s.doneMs !== null)
        ? { ...x, exercises: x.exercises.map((y) => (y.rid === o.ex ? { ...y, sets: y.sets.filter((s) => s.doneMs !== null) } : y)) }
        : removeExercise(x, o.ex);
    } else if (o.op === 'swap') {
      const to = catalog.find((c) => c.id === o.to);
      if (to) x = swapExercise(x, o.ex, to, history, studios);
    } else if (o.op === 'sets') {
      let seen = 0;
      x = { ...x, exercises: x.exercises.map((y) => (y.rid === o.ex ? { ...y, sets: y.sets.filter((s) => s.doneMs !== null || seen++ < o.open) } : y)) };
    } else {
      x = { ...x, exercises: x.exercises.map((y) => (y.rid === o.ex ? { ...y, sets: y.sets.map((s) => (s.doneMs === null && s.weightKg !== null ? { ...s, weightKg: half(s.weightKg * (1 - o.pct / 100)) } : s)) } : y)) };
    }
  }
  return x;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export const changeTaken = (w: TrackedWorkout, id: string): boolean => !!w.changes?.some((c) => c.id === id);

/**
 * Applies the change and records it in the workout, so one write of the workout holds both. Taking an id that is
 * already listed changes nothing. `line`: why some ops did not apply, in words.
 */
export function takeChange(w: TrackedWorkout, id: string, change: WorkoutChange, history: LoggedWorkout[], catalog: Exercise[], studios: StudioState, nowMs: number): { workout: TrackedWorkout; line: string | null } {
  if (changeTaken(w, id)) return { workout: w, line: null };
  const { ops, reasons } = checkOps(change, w, catalog);
  const line = gehtNicht(reasons);
  if (ops.length === 0) return { workout: w, line };
  const next = applyWorkoutChange(w, { workoutId: change.workoutId, ops }, history, catalog, studios);
  const touched = new Set(ops.map((o) => o.ex));
  const before = new Set(w.exercises.map((e) => e.rid));
  const isTouched = (e: TrackedWorkout['exercises'][number]) => touched.has(e.rid) || !before.has(e.rid);
  const entry: WorkoutChangeEntry = {
    id, atMs: nowMs,
    prior: w.exercises.filter((e) => touched.has(e.rid)),
    pos: w.exercises.flatMap((e, i) => (touched.has(e.rid) ? [i] : [])),
    after: next.exercises.filter(isTouched),
  };
  return { workout: { ...next, changes: [...(w.changes ?? []), entry] }, line };
}

const rids = (rows: { rid?: string }[]) => new Set(rows.map((r) => r.rid));

/** null when undo is possible, else the reason in words. */
export function undoRefusal(w: TrackedWorkout, id: string): string | null {
  const c = w.changes?.find((x) => x.id === id);
  if (!c) return 'Das gibt es nicht mehr.';
  const mine = rids(c.after as { rid?: string }[]);
  const rows = w.exercises.filter((e) => mine.has(e.rid));
  if (rows.some((e) => e.sets.some((s) => s.doneMs !== null && s.doneMs > c.atMs))) return 'Geht nicht mehr, weil du in dieser Übung schon weitertrainiert hast.';
  if (!same(rows, c.after)) return 'Geht nicht mehr, weil du sie inzwischen selbst geändert hast.';
  return null;
}

/** Restores the touched rows as they were and removes the entry, in one step. Refused: the workout is returned as it is. */
export function undoChange(w: TrackedWorkout, id: string): { workout: TrackedWorkout; refusal: string | null } {
  const refusal = undoRefusal(w, id);
  const c = w.changes?.find((x) => x.id === id);
  if (refusal || !c) return { workout: w, refusal };
  const mine = rids(c.after as { rid?: string }[]);
  const exercises = w.exercises.filter((e) => !mine.has(e.rid));
  (c.prior as TrackedWorkout['exercises']).forEach((e, k) => exercises.splice(Math.min(c.pos[k] ?? exercises.length, exercises.length), 0, e));
  const changes = (w.changes ?? []).filter((x) => x.id !== id);
  const { changes: _old, ...rest } = w;
  return { workout: { ...rest, exercises, ...(changes.length ? { changes } : {}) }, refusal: null };
}

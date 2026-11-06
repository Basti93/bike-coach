import type { WorkoutChange, WorkoutOp } from '../shared/chat';
import type { Exercise } from '../shared/exercises';
import type { LoggedWorkout } from '../shared/records';
import { NO_STUDIOS, type StudioState } from '../shared/studio';
import { removeExercise, swapExercise, type TrackedWorkout } from './session';

const open = (w: TrackedWorkout, ex: string) => w.exercises.find((e) => e.rid === ex)?.sets.filter((s) => s.doneMs === null) ?? [];
const half = (kg: number) => Math.round(kg * 2) / 2;

/** The ops that can apply to this workout: their row exists and still has open sets, a swap target is in the catalog. */
export function validOps(change: WorkoutChange, w: TrackedWorkout, catalog: Exercise[]): WorkoutOp[] {
  if (change.workoutId !== w.id || w.endMs !== null) return [];
  return change.ops.filter((o) => open(w, o.ex).length > 0 && (o.op !== 'swap' || catalog.some((e) => e.id === o.to)));
}

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

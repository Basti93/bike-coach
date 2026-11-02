import type { StrengthWorkout } from '../hevy';
import type { ExerciseTemplate } from './types';
import { COMPARABLE_DAYS, LONG_BREAK_DAYS, MAX_STEP_PCT, MIN_COMPARABLE, MIN_STEP_KG, RECENT_DAYS, REP_MAX, REP_MIN, STEP_BACK } from './limits';

const DAY_MS = 86_400_000;
const LEG_MUSCLES = ['quadriceps', 'hamstrings', 'glutes', 'calves'];
const LEG_WINDOW_MS = 48 * 3_600_000;

export type Availability = { templateId: string; title: string; lastMs: number; recent: boolean };
export type Suggestion = { weightKg: number | null; reps: number; why: 'progress' | 'keep' | 'step-back' | 'none' };

/** Exercises ever done, newest first. Exercises without a template id are skipped. */
export function availableExercises(workouts: StrengthWorkout[], nowMs: number): Availability[] {
  const found = new Map<string, Availability>();
  for (const w of workouts) {
    for (const e of w.exercises) {
      if (!e.templateId) continue;
      const known = found.get(e.templateId);
      if (!known || w.startMs >= known.lastMs) {
        found.set(e.templateId, { templateId: e.templateId, title: e.title, lastMs: w.startMs, recent: nowMs - w.startMs <= RECENT_DAYS * DAY_MS });
      }
    }
  }
  return [...found.values()].sort((a, b) => b.lastMs - a.lastMs);
}

type Session = { ms: number; weightKg: number | null; minReps: number; sets: number[] };

/** One value per session: the heaviest weight of the normal and failure sets and the reps done at it. */
function sessionsOf(templateId: string, workouts: StrengthWorkout[], nowMs: number): Session[] {
  const out: Session[] = [];
  for (const w of workouts) {
    if (w.startMs > nowMs) continue;
    for (const e of w.exercises) {
      if (e.templateId !== templateId) continue;
      const work = e.workSets.filter((s) => (s.type === 'normal' || s.type === 'failure') && s.reps !== null && s.reps > 0);
      if (work.length === 0) continue;
      const top = Math.max(...work.map((s) => s.weightKg ?? 0));
      const atTop = work.filter((s) => (s.weightKg ?? 0) === top).map((s) => s.reps as number);
      out.push({ ms: w.startMs, weightKg: top > 0 ? top : null, minReps: Math.min(...atTop), sets: atTop });
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}

const toHalf = (kg: number, mode: 'round' | 'floor'): number => Math[mode](kg * 2) / 2;

/**
 * Double progression: reps first, then weight. "All reps reached" means every top-weight set of the last
 * session did at least as many reps as the lowest set of the session before it, at the same or a lower weight.
 */
export function suggestNext(templateId: string, workouts: StrengthWorkout[], nowMs: number): Suggestion {
  const sessions = templateId ? sessionsOf(templateId, workouts, nowMs) : [];
  const last = sessions[sessions.length - 1];
  if (!last) return { weightKg: null, reps: REP_MIN, why: 'none' };
  const reps = Math.max(1, last.minReps);
  if (nowMs - last.ms > LONG_BREAK_DAYS * DAY_MS) {
    return { weightKg: last.weightKg === null ? null : toHalf(last.weightKg * STEP_BACK, 'round'), reps, why: 'step-back' };
  }
  const comparable = sessions.filter((s) => nowMs - s.ms <= COMPARABLE_DAYS * DAY_MS);
  if (comparable.length < MIN_COMPARABLE) return { weightKg: last.weightKg, reps, why: 'keep' };
  const before = comparable[comparable.length - 2];
  const reached = (last.weightKg ?? 0) >= (before.weightKg ?? 0) && last.sets.every((r) => r >= before.minReps);
  if (!reached) return { weightKg: last.weightKg, reps, why: 'keep' };
  if (last.weightKg === null || reps < REP_MAX) return { weightKg: last.weightKg, reps: reps + 1, why: 'progress' };
  const step = Math.max(last.weightKg * MAX_STEP_PCT / 100, MIN_STEP_KG);
  return { weightKg: toHalf(last.weightKg + step, 'floor'), reps: REP_MIN, why: 'progress' };
}

/** True when quadriceps, hamstrings, glutes or calves were trained in the last 48 hours. */
export function recentLegWork(workouts: StrengthWorkout[], templates: ExerciseTemplate[], nowMs: number): boolean {
  const legIds = new Set(templates.filter((t) => LEG_MUSCLES.includes(t.primaryMuscle)).map((t) => t.id));
  return workouts.some((w) => w.startMs <= nowMs && nowMs - w.startMs <= LEG_WINDOW_MS && w.exercises.some((e) => e.templateId && legIds.has(e.templateId)));
}

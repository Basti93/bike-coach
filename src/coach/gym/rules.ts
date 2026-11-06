import type { ExerciseTemplate, GymExercise, GymWorkout } from './types';
import { RECENT_DAYS } from './limits';
import { repRangeOf } from '../../shared/muscle-targets';
import { LEG_MUSCLES, availableExercises, isRepBased, recentLegWork, suggestNext } from './history';
import type { GymContext } from './guardrails';

const DAY_MS = 86_400_000;
const CORE_SIZE = 6;
const SETS = 3;
const START_REPS = 10;
const REST_S = 90;
const FALLBACK_MUSCLES = ['quadriceps', 'chest', 'lats', 'front_delts', 'side_delts', 'hamstrings', 'triceps', 'biceps'];

function exerciseOf(t: ExerciseTemplate, ctx: GymContext): GymExercise {
  const s = suggestNext(t.id, ctx.workouts, ctx.nowMs, t, { studio: ctx.studio, overrides: ctx.overrides, renames: ctx.renames });
  const range = repRangeOf(t);
  const reps = s.why === 'none' ? Math.min(range.max, Math.max(range.min, START_REPS)) : s.reps;
  return { templateId: t.id, title: t.title, restS: REST_S, supersetId: null, notes: '', sets: Array.from({ length: SETS }, () => ({ type: 'normal' as const, weightKg: s.weightKg, reps })) };
}

/**
 * The workout used when the AI answer fails the check twice, or when there is no AI. Plain and safe by construction,
 * so it is not put through `checkWorkout` (the empty-history fallback would not pass it anyway).
 * Caller contract: an empty exercise list must never be offered to the rider or written to Hevy.
 */
export function ruleWorkout(ctx: GymContext): { workout: GymWorkout; reason: string } {
  const byId = new Map(ctx.templates.map((t) => [t.id, t]));
  const recentLegs = recentLegWork(ctx.workouts, ctx.templates, ctx.nowMs);
  const legsTired = recentLegs || ctx.avoidLegs === true;
  const allowed = (t: ExerciseTemplate): boolean => isRepBased(t) && !ctx.excluded?.has(t.id) && !(legsTired && LEG_MUSCLES.includes(t.primaryMuscle));
  const since = ctx.nowMs - RECENT_DAYS * DAY_MS;
  const count = new Map<string, number>();
  for (const w of ctx.workouts) {
    if (w.startMs > ctx.nowMs || w.startMs < since) continue;
    for (const id of new Set(w.exercises.map((e) => e.templateId))) if (id) count.set(id, (count.get(id) ?? 0) + 1);
  }
  const lastMs = new Map(availableExercises(ctx.workouts, ctx.nowMs).map((a) => [a.templateId, a.lastMs]));
  const core = [...count.keys()]
    .map((id) => byId.get(id))
    .filter((t): t is ExerciseTemplate => !!t && allowed(t))
    .sort((a, b) => (count.get(b.id)! - count.get(a.id)!) || ((lastMs.get(b.id) ?? 0) - (lastMs.get(a.id) ?? 0)) || a.id.localeCompare(b.id))
    .slice(0, CORE_SIZE);
  if (core.length > 0) {
    return {
      workout: { name: 'Ganzkörper', exercises: core.map((t) => exerciseOf(t, ctx)) },
      reason: legsTired && !recentLegs
        ? 'Deine häufigsten Übungen der letzten Monate, ohne Beinarbeit, damit die Beine geschont bleiben.'
        : legsTired
        ? 'Deine häufigsten Übungen der letzten Monate, ohne schwere Beinarbeit, weil die Beine noch Pause brauchen.'
        : 'Deine häufigsten Übungen der letzten Monate in ruhigem Aufbau, damit sich Fortschritt gut messen lässt.',
    };
  }
  const machines = ctx.templates.filter((t) => t.equipment === 'machine' && allowed(t));
  const picked = FALLBACK_MUSCLES.map((m) => machines.find((t) => t.primaryMuscle === m)).filter((t): t is ExerciseTemplate => !!t).slice(0, CORE_SIZE);
  if (picked.length === 0) {
    return { workout: { name: 'Ganzkörper', exercises: [] }, reason: 'Ich habe keine passenden Übungen gefunden, deshalb gibt es gerade kein Training. Sobald Hevy mehr Übungen liefert, geht es weiter.' };
  }
  const exercises = picked.map((t) => exerciseOf(t, ctx));
  const hasHistory = ctx.workouts.some((w) => w.startMs <= ctx.nowMs);
  const withWeights = exercises.some((e) => e.sets.some((s) => s.weightKg !== null));
  return {
    workout: { name: 'Ganzkörper an Geräten', exercises },
    reason: !hasHistory
      ? 'Noch keine früheren Trainings: ein einfaches Ganzkörpertraining an Geräten, ohne Gewichte. Taste dich in Ruhe heran.'
      : withWeights
        ? 'Aus deinem Verlauf passt gerade keine Übung gut, deshalb ein einfaches Ganzkörpertraining an Geräten. Wo du eine Übung schon kennst, steht ein Gewicht aus deinem Verlauf dabei, sonst taste dich in Ruhe heran.'
        : 'Aus deinem Verlauf passt gerade keine Übung gut, deshalb ein einfaches Ganzkörpertraining an Geräten, ohne Gewichte. Taste dich in Ruhe heran.',
  };
}

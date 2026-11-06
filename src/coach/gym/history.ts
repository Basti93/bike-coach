import type { Effort } from '../../shared/records';
import type { StrengthWorkout } from '../hevy';
import type { ExerciseTemplate } from './types';
import { ruleNumber } from '../../shared/training-policy';
import { learnLadder, nextUp, snapDown, withOverride, type Ladder, type LoadStepOverrides } from '../../shared/loads';
import { repRangeOf } from '../../shared/muscle-targets';
import { mainStudio, studioKey } from '../../shared/studio';
import { COMPARABLE_DAYS, DROP_STEP_BACK, LONG_BREAK_DAYS, MIN_COMPARABLE, RECENT_DAYS, STEP_BACK } from './limits';

const DAY_MS = 86_400_000;
export const LEG_MUSCLES = ['quadriceps', 'hamstrings', 'glutes', 'calves'];
const LEG_WINDOW_MS = 48 * 3_600_000;

/** The assistance is weight_kg here, so more of it is easier. In this first version its weight is simply kept. */
export const isAssisted = (type: string | undefined): boolean => type === 'bodyweight_assisted' || type === 'bodyweight_assisted_reps';
/** Hevy's rep-based exercise types. Timed and distance exercises cannot become sets of reps. */
const REP_TYPES = ['weight_reps', 'reps_only', 'bodyweight_reps', 'bodyweight_weighted', 'bodyweight_assisted', 'bodyweight_assisted_reps'];
export const isRepBased = (t: ExerciseTemplate): boolean => REP_TYPES.includes(t.type);

export type Availability = { templateId: string; title: string; lastMs: number; recent: boolean };
export type Suggestion = { weightKg: number | null; reps: number; why: 'progress' | 'keep' | 'step-back' | 'none' };

/** Exercises ever done, newest first. Exercises without a template id are skipped. */
export function availableExercises(workouts: StrengthWorkout[], nowMs: number): Availability[] {
  const found = new Map<string, Availability>();
  for (const w of workouts) {
    if (w.startMs > nowMs) continue;
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

/** What progression needs to know about an exercise: the catalog entry's fields. */
export type ExerciseInfo = { type?: string; equipment?: string; primaryMuscle?: string | null };
/** Where the plan is for: the studio (undefined: the main one) and the person's weight-step overrides. */
export type Plan = { studio?: string; overrides?: LoadStepOverrides };

type Sets = StrengthWorkout['exercises'][number]['workSets'];
type Session = { ms: number; weightKg: number | null; minReps: number; sets: number[]; effort?: Effort };

/** The bucket the plan is for. No studio known means the main studio, or the one shared bucket. */
const plannedKey = (workouts: StrengthWorkout[], plan: Plan | undefined): string => plan?.studio ?? mainStudio(workouts) ?? '';

/** The exercise's sessions in the planned studio only, oldest first. Several occurrences in one workout are one session. */
function occurrences(templateId: string, workouts: StrengthWorkout[], nowMs: number, plan: Plan | undefined): { ms: number; sets: Sets; effort?: Effort }[] {
  const main = mainStudio(workouts);
  const key = plannedKey(workouts, plan);
  const out: { ms: number; sets: Sets; effort?: Effort }[] = [];
  for (const w of workouts) {
    if (w.startMs > nowMs || studioKey(w, main) !== key) continue;
    const mine = w.exercises.filter((e) => e.templateId === templateId);
    if (mine.length === 0) continue;
    const effort = [...mine].reverse().find((e) => e.effort)?.effort;
    out.push({ ms: w.startMs, sets: mine.flatMap((e) => e.workSets), ...(effort ? { effort } : {}) });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/** One value per session: the heaviest weight of the normal and failure sets and the reps done at it. */
function sessionsOf(templateId: string, workouts: StrengthWorkout[], nowMs: number, plan: Plan | undefined): Session[] {
  const out: Session[] = [];
  for (const o of occurrences(templateId, workouts, nowMs, plan)) {
    const work = o.sets.filter((s) => (s.type === 'normal' || s.type === 'failure') && s.reps !== null && s.reps > 0);
    if (work.length === 0) continue;
    const top = Math.max(...work.map((s) => s.weightKg ?? 0));
    const atTop = work.filter((s) => (s.weightKg ?? 0) === top).map((s) => s.reps as number);
    out.push({ ms: o.ms, weightKg: top > 0 ? top : null, minReps: Math.min(...atTop), sets: atTop, ...(o.effort ? { effort: o.effort } : {}) });
  }
  return out;
}

const LADDER_SESSIONS = 10;
const BAR_KG = ruleNumber('load.bar-kg');

/**
 * The weight steps of an exercise in the planned studio: learned from its newest 10 sessions there, then the person's override.
 * The learned anchor is the lightest weight seen, which is no floor of the equipment: the lattice goes on below it (down to
 * one step, or the bar for a barbell), so a step back or a break can go lighter than anything seen so far.
 */
export function ladderFor(templateId: string, ex: ExerciseInfo | undefined, workouts: StrengthWorkout[], nowMs: number, plan?: Plan): Ladder {
  const weights = occurrences(templateId, workouts, nowMs, plan).slice(-LADDER_SESSIONS)
    .flatMap((o) => o.sets.map((s) => s.weightKg ?? 0).filter((w) => w > 0));
  const seen = weights.filter((w) => w > 0);
  const base = learnLadder(weights, ex?.equipment ?? 'other');
  // The learner works on a 0.25 kg grid; the anchor is the exact lightest weight, so that real weights like 22.68 stay reachable.
  const learned = seen.length > 0 ? { ...base, anchorKg: Math.min(...seen) } : base;
  const l = withOverride(learned, plan?.overrides ?? new Map(), { exerciseId: templateId, studio: plannedKey(workouts, plan) });
  const floor = ex?.equipment === 'barbell' && l.anchorKg >= BAR_KG ? BAR_KG : 0;
  const below = floor > 0 ? Math.floor((l.anchorKg - floor) / l.stepKg + 1e-6) : Math.max(0, Math.ceil(l.anchorKg / l.stepKg - 1e-6) - 1);
  return { ...l, anchorKg: Math.round((l.anchorKg - below * l.stepKg) * 100) / 100 };
}

/** "in 5-kg-Stufen", for the prompt. */
export const stepWords = (l: Ladder): string => `in ${String(l.stepKg).replace('.', ',')}-kg-Stufen`;

/**
 * Double progression: reps first, then weight. "All reps reached" means every top-weight set of the last
 * session did at least as many reps as the lowest set of the session before it, at the same or a lower weight.
 * The rep range is the exercise's own, the weight steps are the ones reachable in the planned studio. Only sessions
 * of that studio count. "0 left" is no reason on its own to hold or lower the weight: the numbers decide.
 */
export function suggestNext(templateId: string, workouts: StrengthWorkout[], nowMs: number, ex?: ExerciseInfo, plan?: Plan): Suggestion {
  const sessions = templateId ? sessionsOf(templateId, workouts, nowMs, plan) : [];
  const range = repRangeOf({ primaryMuscle: ex?.primaryMuscle });
  const last = sessions[sessions.length - 1];
  if (!last) return { weightKg: null, reps: range.min, why: 'none' };
  // Weighted work stays in the rep range; bodyweight work has no upper limit, since reps are its only progression.
  const fit = (r: number): number => last.weightKg === null ? Math.max(1, r) : Math.min(range.max, Math.max(range.min, r));
  const reps = fit(last.minReps);
  const assisted = isAssisted(ex?.type);
  const ladder = ladderFor(templateId, ex, workouts, nowMs, plan);
  const stepBack = (kg: number): number => snapDown(kg * STEP_BACK, ladder);
  if (nowMs - last.ms > LONG_BREAK_DAYS * DAY_MS) {
    return { weightKg: last.weightKg === null || assisted ? last.weightKg : stepBack(last.weightKg), reps, why: 'step-back' };
  }
  const comparable = sessions.filter((s) => nowMs - s.ms <= COMPARABLE_DAYS * DAY_MS);
  // Fewer reps against the session before at the same or a higher weight, several times in a row: the weight is too much for now.
  let drops = 0;
  for (let i = comparable.length - 1; i >= 1; i--) {
    const [prev, cur] = [comparable[i - 1], comparable[i]];
    if (cur.weightKg === null || prev.weightKg === null || cur.weightKg < prev.weightKg || cur.minReps >= prev.minReps) break;
    drops++;
  }
  if (drops >= DROP_STEP_BACK && last.weightKg !== null && !assisted) return { weightKg: stepBack(last.weightKg), reps, why: 'step-back' };
  if (last.effort !== 'plenty') {
    if (comparable.length < MIN_COMPARABLE) return { weightKg: last.weightKg, reps, why: 'keep' };
    const before = comparable[comparable.length - 2];
    const reached = (last.weightKg ?? 0) >= (before.weightKg ?? 0) && last.sets.every((r) => r >= before.minReps);
    if (!reached) return { weightKg: last.weightKg, reps, why: 'keep' };
  }
  if (last.weightKg === null || last.minReps < range.max) return { weightKg: last.weightKg, reps: fit(last.minReps + 1), why: 'progress' };
  if (assisted) return { weightKg: last.weightKg, reps, why: 'keep' };
  return { weightKg: nextUp(last.weightKg, ladder), reps: range.min, why: 'progress' };
}

/** True when quadriceps, hamstrings, glutes or calves were trained in the last 48 hours. */
export function recentLegWork(workouts: StrengthWorkout[], templates: ExerciseTemplate[], nowMs: number): boolean {
  const legIds = new Set(templates.filter((t) => LEG_MUSCLES.includes(t.primaryMuscle)).map((t) => t.id));
  return workouts.some((w) => w.startMs <= nowMs && nowMs - w.startMs <= LEG_WINDOW_MS && w.exercises.some((e) => e.templateId && legIds.has(e.templateId)));
}

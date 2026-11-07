import { ruleNumber } from './training-policy';

/** The shape of a gym workout the estimate needs (the coach's GymWorkout fits). */
export type TimedWorkout = { exercises: { restS: number | null; sets: readonly unknown[] }[] };

const roundTo5 = (min: number): number => Math.round(min / 5) * 5;

/**
 * About how long a gym workout takes: warm-up, every set (work time plus the exercise's rest) and the change between
 * exercises, rounded to 5 minutes. A workout without exercises takes none.
 */
export function gymMinutes(w: TimedWorkout): number {
  if (w.exercises.length === 0) return 0;
  const work = ruleNumber('duration.set-work-s');
  const sets = w.exercises.reduce((a, e) => a + e.sets.length * (work + (e.restS ?? 0)), 0);
  const changes = (w.exercises.length - 1) * ruleNumber('duration.change-s');
  return roundTo5(ruleNumber('duration.gym-warmup-min') + (sets + changes) / 60);
}

/** The longest a gym workout may be for a time budget: the budget plus the slack. */
export const gymLimit = (budgetMinutes: number): number => budgetMinutes * (1 + ruleNumber('duration.slack-pct') / 100);

/** The words for the plan reason and card. */
export const durationNote = (w: TimedWorkout): string => `ca. ${gymMinutes(w)} Min`;

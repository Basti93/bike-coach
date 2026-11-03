import { MUSCLE_TARGETS, muscleGroupOf, weeklySetRange, type MuscleGroup } from '../../shared/muscle-targets';
import type { StrengthWorkout } from '../hevy';
import type { ExerciseTemplate } from './types';

const DAY_MS = 86_400_000;

export type GroupVolume = {
  group: MuscleGroup; label: string; last7Days: number; perWeek4Weeks: number; sum4Weeks: number;
  target: { min: number; max: number }; reps: { min: number; max: number };
};

/** Working sets (no warm-ups) per muscle group: the last 7 days and the weekly average of the last 4 weeks. */
export function muscleVolume(workouts: StrengthWorkout[], templates: ExerciseTemplate[], nowMs: number, goal: string | null | undefined): GroupVolume[] {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const week = new Map<MuscleGroup, number>();
  const month = new Map<MuscleGroup, number>();
  for (const w of workouts) {
    const age = nowMs - w.startMs;
    if (age < 0 || age > 28 * DAY_MS) continue;
    for (const e of w.exercises) {
      const t = byId.get(e.templateId);
      const g = muscleGroupOf({ id: e.templateId, title: e.title, primaryMuscle: t?.primaryMuscle });
      const n = e.workSets.filter((s) => s.type !== 'warmup').length;
      month.set(g, (month.get(g) ?? 0) + n);
      if (age <= 7 * DAY_MS) week.set(g, (week.get(g) ?? 0) + n);
    }
  }
  return (Object.keys(MUSCLE_TARGETS) as MuscleGroup[])
    .filter((g) => g !== 'other' || (month.get(g) ?? 0) > 0)
    .map((g) => ({
      group: g, label: MUSCLE_TARGETS[g].label, last7Days: week.get(g) ?? 0,
      sum4Weeks: month.get(g) ?? 0,
      perWeek4Weeks: Math.round(((month.get(g) ?? 0) / 4) * 10) / 10,
      target: weeklySetRange(g, goal), reps: MUSCLE_TARGETS[g].reps,
    }));
}

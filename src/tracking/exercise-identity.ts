import { exerciseTitles, type Exercise } from '../shared/exercises';
import { MUSCLE_TARGETS, muscleGroupOf, type MuscleGroup } from '../shared/muscle-targets';

/** Where the muscle of a logged exercise comes from: the catalog, another source (Hevy templates via the stats record), or nowhere. */
export type MuscleSource = 'catalog' | 'external' | 'unknown';
export type ResolvedExercise = { exercise: Exercise | null; group: MuscleGroup | null; muscleSource: MuscleSource };

/**
 * The one identity of a logged exercise: the catalog entry with its id, else the one with exactly this title (German,
 * Hevy, Hevy with German equipment, alias). Never a look-alike by name: "Squat (Smith Machine)" is not the barbell
 * squat. Without a catalog entry the muscle may come from `externalMuscles` (exercise id → muscle); else it is unknown.
 */
export function resolveExercise(logged: { exerciseId: string; title: string }, catalog: Exercise[], externalMuscles?: Record<string, string> | null): ResolvedExercise {
  const title = logged.title.trim();
  const exercise = catalog.find((e) => e.id === logged.exerciseId) ?? catalog.find((e) => exerciseTitles(e).includes(title)) ?? null;
  if (exercise) return { exercise, group: muscleGroupOf(exercise), muscleSource: 'catalog' };
  const m = externalMuscles && Object.hasOwn(externalMuscles, logged.exerciseId) ? externalMuscles[logged.exerciseId] : undefined;
  if (typeof m === 'string' && m) {
    const group = Object.hasOwn(MUSCLE_TARGETS, m) ? (m as MuscleGroup) : muscleGroupOf({ id: logged.exerciseId, title, primaryMuscle: m });
    return { exercise: null, group, muscleSource: 'external' };
  }
  return { exercise: null, group: null, muscleSource: 'unknown' };
}

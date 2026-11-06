import { descriptionOf, type ExerciseDescription } from '../shared/exercise-descriptions';
import type { Exercise } from '../shared/exercises';
import { resolveExercise } from './exercise-identity';
import { muscleLabel } from './ui/labels';

/** The movement without the equipment in brackets: "Squat (Smith Machine)" → "squat". */
const base = (title: string) => title.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
const names = (e: Exercise) => [e.title, ...(e.hevyTitle ? [e.hevyTitle] : [])];
const lastWord = (s: string) => s.split(/[\s-]+/).filter(Boolean).pop() ?? '';

/** Search over the German name, the English Hevy name and the muscle. */
export function matchesSearch(e: Exercise, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return [...names(e), muscleLabel(e.primaryMuscle)].some((s) => s.toLowerCase().includes(n));
}

/**
 * What fits in place of an exercise: the same muscle on top, and within it the same movement first (any equipment).
 * Another muscle only appears for the exact same movement. Works for Hevy titles too, whose template ids are not in
 * the own list: their muscle comes from the same movement, else from what most exercises of that kind train.
 */
export function similarExercises(current: { title: string; exerciseId: string }, catalog: Exercise[]): Exercise[] {
  const want = base(current.title);
  const word = lastWord(want);
  const movement = (e: Exercise) => {
    const bases = names(e).map(base);
    if (bases.includes(want)) return 2;
    if (word.length > 3 && bases.some((b) => lastWord(b) === word)) return 1;
    return 0;
  };
  const self = catalog.find((e) => e.id === current.exerciseId || names(e).includes(current.title));
  const muscle = self?.primaryMuscle ?? catalog.find((e) => movement(e) === 2)?.primaryMuscle ?? mostCommon(catalog.filter((e) => movement(e) === 1).map((e) => e.primaryMuscle));
  return catalog
    .filter((e) => e !== self && e.id !== current.exerciseId)
    .map((e) => ({ e, same: !!muscle && e.primaryMuscle === muscle, move: movement(e) }))
    .filter((x) => x.same || x.move === 2)
    .sort((a, b) => Number(b.same) - Number(a.same) || b.move - a.move || a.e.title.localeCompare(b.e.title, 'de'))
    .map((x) => x.e);
}

const mostCommon = (xs: string[]): string | undefined => {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/**
 * How to do an exercise, also for Hevy exercises (whose ids are Hevy template ids): only the text of the very same
 * exercise (see resolveExercise). A look-alike with other equipment never lends its text.
 */
export function describeExercise(current: { title: string; exerciseId: string }, catalog: Exercise[]): ExerciseDescription | null {
  const e = resolveExercise(current, catalog).exercise;
  return descriptionOf(e ?? { id: current.exerciseId });
}

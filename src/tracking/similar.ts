import { exerciseDescription, type ExerciseDescription } from '../shared/exercise-descriptions';
import type { Exercise } from '../shared/exercises';
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
 * What fits in place of an exercise: the same movement first (any equipment), then the
 * same kind of movement, then the rest of the same muscle. Works for Hevy titles too,
 * whose template ids are not in the own list.
 */
export function similarExercises(current: { title: string; exerciseId: string }, catalog: Exercise[]): Exercise[] {
  const want = base(current.title);
  const word = lastWord(want);
  const movement = (e: Exercise) => {
    const bases = names(e).map(base);
    if (bases.includes(want)) return 3;
    if (word.length > 3 && bases.some((b) => lastWord(b) === word)) return 2;
    return 0;
  };
  const self = catalog.find((e) => e.id === current.exerciseId || names(e).includes(current.title));
  const muscle = self?.primaryMuscle ?? catalog.find((e) => movement(e) === 3)?.primaryMuscle
    ?? catalog.find((e) => movement(e) === 2)?.primaryMuscle;
  return catalog
    .filter((e) => e !== self && e.id !== current.exerciseId)
    .map((e) => ({ e, score: movement(e) + (muscle && e.primaryMuscle === muscle ? 1 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title, 'de'))
    .map((x) => x.e);
}

/**
 * How to do an exercise, also for Hevy exercises (whose ids are Hevy template ids): by own id, then by the exact
 * German or English title, then by the same movement with other equipment. `via` names that stand-in, else null.
 */
export function describeExercise(current: { title: string; exerciseId: string }, catalog: Exercise[]): { description: ExerciseDescription; via: string | null } | null {
  const own = exerciseDescription(current.exerciseId);
  if (own) return { description: own, via: null };
  for (const e of catalog) {
    const d = names(e).includes(current.title) ? exerciseDescription(e.id) : null;
    if (d) return { description: d, via: null };
  }
  const want = base(current.title);
  for (const e of catalog) {
    const d = names(e).map(base).includes(want) ? exerciseDescription(e.id) : null;
    if (d) return { description: d, via: e.title };
  }
  return null;
}

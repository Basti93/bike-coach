import type { StrengthWorkout } from '../hevy';
import type { LoggedWorkout } from '../../shared/records';
import { knownHevyLinks } from '../../shared/exercises';

type Links = ReadonlyMap<string, string>;

/** Same shape the Hevy conversion makes, so suggestNext works on both. An unfinished workout has no duration (0). */
export function toStrengthWorkout(w: LoggedWorkout, links: Links = knownHevyLinks()): StrengthWorkout {
  return {
    id: w.id, title: w.title, startMs: w.startMs,
    durationS: w.endMs === null ? 0 : Math.max(0, Math.round((w.endMs - w.startMs) / 1000)),
    exercises: w.exercises.map((e) => {
      const work = e.sets.filter((s) => s.type !== 'warmup');
      return {
        title: e.title, templateId: links.get(e.exerciseId) ?? e.exerciseId,
        workSets: e.sets.map((s) => ({ type: s.type, weightKg: s.weightKg ?? null, reps: s.reps ?? null })),
        sets: work.length,
        reps: work.reduce((a, s) => a + (s.reps ?? 0), 0),
        volumeKg: Math.round(work.reduce((a, s) => a + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
      };
    }),
  };
}

/** Finished own workouts only; one still open is not history yet. */
export const historyFromLogged = (logged: LoggedWorkout[], links: Links = knownHevyLinks()): StrengthWorkout[] =>
  logged.filter((w) => w.endMs !== null).map((w) => toStrengthWorkout(w, links));

const overlapsHalf = (a: StrengthWorkout, b: StrengthWorkout): boolean => {
  const aEnd = a.startMs + a.durationS * 1000, bEnd = b.startMs + b.durationS * 1000;
  const overlap = Math.min(aEnd, bEnd) - Math.max(a.startMs, b.startMs);
  const shorter = Math.min(a.durationS, b.durationS) * 1000;
  if (shorter === 0) return a.startMs === b.startMs;
  return overlap > 0 && overlap >= shorter / 2;
};

/**
 * Own and Hevy history as one list, oldest first. A Hevy workout that overlaps an own one by at least half of the
 * shorter is the same session: it is dropped and the own one stays. Own exercises with a Hevy link are renamed to the
 * Hevy template id, so one exercise keeps one id; `own` may already be mapped, which is harmless.
 */
export function mergeHistory(own: StrengthWorkout[], hevy: StrengthWorkout[], links: Links = knownHevyLinks()): StrengthWorkout[] {
  const mapped = own.map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, templateId: links.get(e.templateId) ?? e.templateId })) }));
  const kept = hevy.filter((h) => !mapped.some((o) => overlapsHalf(o, h)));
  return [...mapped, ...kept].sort((a, b) => a.startMs - b.startMs);
}

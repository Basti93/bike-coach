import type { StrengthWorkout } from '../hevy';
import type { LoggedWorkout } from '../../shared/records';
import { overlapsHalf } from '../../shared/history';

/** Hevy template id to own exercise id (see linkHevyTemplates). Pass an empty map when nothing is linked. */
type Links = ReadonlyMap<string, string>;

/** Same shape the Hevy conversion makes, so suggestNext works on both. An unfinished workout has no duration (0). */
export function toStrengthWorkout(w: LoggedWorkout, links: Links): StrengthWorkout {
  // Pandafit sets only count once confirmed; Hevy has no confirmation, so all its sets are real.
  const real = (sets: LoggedWorkout['exercises'][number]['sets']) => w.source === 'pandafit' ? sets.filter((s) => s.doneMs !== null) : sets;
  return {
    id: w.id, title: w.title, startMs: w.startMs,
    durationS: w.endMs === null ? 0 : Math.max(0, Math.round((w.endMs - w.startMs) / 1000)),
    exercises: w.exercises.map((e) => ({ e, sets: real(e.sets) })).filter((x) => x.sets.length > 0).map(({ e, sets }) => {
      const work = sets.filter((s) => s.type !== 'warmup');
      return {
        title: e.title, templateId: links.get(e.exerciseId) ?? e.exerciseId,
        workSets: sets.map((s) => ({ type: s.type, weightKg: s.weightKg ?? null, reps: s.reps ?? null })),
        ...(e.effort && e.effort !== 'skip' ? { effort: e.effort } : {}),
        sets: work.length,
        reps: work.reduce((a, s) => a + (s.reps ?? 0), 0),
        volumeKg: Math.round(work.reduce((a, s) => a + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
      };
    }),
  };
}

/** Finished own workouts only; one still open is not history yet. */
export const historyFromLogged = (logged: LoggedWorkout[], links: Links): StrengthWorkout[] =>
  logged.filter((w) => w.endMs !== null).map((w) => toStrengthWorkout(w, links));

const seconds = (n: unknown): number => typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;

const asSpan = (w: StrengthWorkout) => ({ startMs: w.startMs, durationMs: seconds(w.durationS) * 1000 });

/**
 * Own and Hevy history as one list, oldest first. A Hevy workout that overlaps an own one by at least half of the
 * shorter is the same session: it is dropped and the own one stays. Exercises with a Hevy template id in `links` are
 * renamed to the own exercise id in both lists, so one exercise keeps one history even when Hevy has duplicates.
 */
export function mergeHistory(own: StrengthWorkout[], hevy: StrengthWorkout[], links: Links): StrengthWorkout[] {
  const norm = (w: StrengthWorkout): StrengthWorkout => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, templateId: links.get(e.templateId) ?? e.templateId })) });
  const mapped = own.map(norm);
  const kept = hevy.filter((h) => !mapped.some((o) => overlapsHalf(asSpan(o), asSpan(h)))).map(norm);
  return [...mapped, ...kept].sort((a, b) => a.startMs - b.startMs);
}

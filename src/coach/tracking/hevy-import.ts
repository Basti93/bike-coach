import type { StrengthWorkout } from '../hevy';
import type { LoggedWorkout, TrackedRecord } from '../../shared/records';

/**
 * A Hevy workout as a stored record. Deterministic on purpose: the same workout always gives the same text, and
 * updatedMs is the workout's own end, never the clock, so importing it again changes nothing and raises no cursor.
 * exerciseId is the own id where `links` has one, else the Hevy template id, so phone and Mac agree on one history.
 */
export function hevyRecord(w: StrengthWorkout, links: ReadonlyMap<string, string> = new Map()): TrackedRecord {
  const endMs = w.startMs + Math.max(0, w.durationS) * 1000;
  const body: LoggedWorkout = {
    id: w.id, title: w.title, startMs: w.startMs, endMs, source: 'hevy',
    exercises: w.exercises.map((e) => ({
      exerciseId: links.get(e.templateId) ?? e.templateId, title: e.title, supersetId: null, notes: '',
      sets: e.workSets.map((s) => ({ type: s.type, weightKg: s.weightKg, reps: s.reps, durationS: null, doneMs: w.startMs })),
    })),
  };
  return { kind: 'workout', id: w.id, updatedMs: endMs, deleted: false, body };
}

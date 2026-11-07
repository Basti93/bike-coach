import { ruleNumber, ruleNumbers, ruleRange, policyRule } from './training-policy';
import { EXERCISES, exerciseTitles, type Exercise } from './exercises';
import { muscleGroupOf } from './muscle-targets';

/** The rest of an exercise comes from here only: the timer, the duration estimate and the coach plan all ask `restOf`. */
type RestSet = { type?: string; reps?: number | null; plannedReps?: number | null; repRange?: { start: number; end: number } };
type RestExercise = { exerciseId?: string; templateId?: string; title?: string; restS?: number | null; sets?: readonly RestSet[] };

export const restMid = (id: string): number => { const r = ruleRange(id); return Math.round((r.min + r.max) / 2); };

/** The planned reps of the first work set (the plan's own number, else the end of its range). */
const plannedRepsOf = (sets: readonly RestSet[] = []): number | null => {
  const s = sets.find((x) => x.type !== 'warmup');
  return s ? (s.plannedReps ?? s.reps ?? s.repRange?.end ?? null) : null;
};

function lookup(e: RestExercise, catalog: readonly Exercise[]): Exercise | null {
  const id = e.exerciseId ?? e.templateId;
  const title = (e.title ?? '').trim();
  return catalog.find((x) => x.id === id) ?? (title ? catalog.find((x) => exerciseTitles(x).includes(title)) : undefined) ?? null;
}

/** Seconds of rest after a set: an explicit rest wins, else the register by kind (heavy, compound, isolation). */
export function restOf(e: RestExercise, catalog: readonly Exercise[] = EXERCISES): number {
  if (typeof e.restS === 'number') return e.restS;
  const reps = plannedRepsOf(e.sets);
  if (reps !== null && reps <= ruleNumber('rest.heavy-max-reps')) return restMid('rest.heavy-strength-s');
  const own = lookup(e, catalog);
  const lists = policyRule('rest.compound-s').lists ?? {};
  const compound = !!own && (lists.groups ?? []).includes(muscleGroupOf(own)) && (lists.equipment ?? []).includes(own.equipment);
  return restMid(compound ? 'rest.compound-s' : 'rest.isolation-s');
}

type RestWorkout = { exercises: (RestExercise & { rid: string; supersetId: number | null; effort?: string; sets: readonly (RestSet & { doneMs: number | null })[] })[] };

/**
 * The rest to start after the set at `setIndex` of exercise `rid`: in a superset only after the last member of the round
 * (null while another member still has that round's set open, skipped members aside), then the longest rest of the members.
 */
export function restAfterSet(w: RestWorkout, rid: string, setIndex: number, catalog: readonly Exercise[] = EXERCISES): number | null {
  const i = w.exercises.findIndex((x) => x.rid === rid);
  const e = w.exercises[i];
  if (!e) return null;
  const group = e.supersetId;
  if (group === null) return restOf(e, catalog);
  if (w.exercises.some((x) => x !== e && x.supersetId === group && x.effort !== 'skip' && x.sets[setIndex]?.doneMs === null)) return null;
  return Math.max(...w.exercises.filter((x) => x.supersetId === group).map((x) => restOf(x, catalog)));
}

export const restExtendS = (): number => ruleNumber('rest.extend-s');
export const restChoices = (): number[] => ruleNumbers('rest.choices');
export { plannedRepsOf };

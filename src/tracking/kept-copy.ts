import type { LoggedWorkout, TrackedRecord } from '../shared/records';

export const KEPT_COPY_NOTE = 'aufbewahrte Kopie von einem anderen Gerät';

const bodyOf = (r: TrackedRecord): Partial<LoggedWorkout> => (typeof r.body === 'object' && r.body !== null ? r.body as Partial<LoggedWorkout> : {});

/** Confirmed sets in a record. A tombstone still carries what it deleted, so a deliberate delete counts as what it saw. */
export function confirmedSets(r: TrackedRecord): number {
  const { exercises } = bodyOf(r);
  if (!Array.isArray(exercises)) return 0;
  return exercises.flatMap((e) => (Array.isArray(e?.sets) ? e.sets : [])).filter((s) => typeof s?.doneMs === 'number').length;
}

/**
 * What stays of a workout version with unsent changes that lost to `winner` while holding more confirmed sets: its own
 * finished record, derived only from the version that lost. A retry, or another run of either client, writes the same
 * text, so there is never a second copy. Hevy's workouts stay in Hevy, a tombstone holds nothing to keep.
 */
export function keptCopy(lost: TrackedRecord, winner: TrackedRecord): TrackedRecord | null {
  const body = bodyOf(lost);
  if (lost.kind !== 'workout' || lost.deleted || body.source === 'hevy' || !Array.isArray(body.exercises)) return null;
  if (confirmedSets(lost) <= confirmedSets(winner)) return null;
  const exercises = body.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => typeof s.doneMs === 'number') })).filter((e) => e.sets.length > 0);
  const lastDone = Math.max(...exercises.flatMap((e) => e.sets.map((s) => s.doneMs as number)));
  const id = `${lost.id}-kopie-${lost.updatedMs}`;
  const title = String(body.title ?? '');
  return {
    kind: 'workout', id, updatedMs: lost.updatedMs, deleted: false,
    body: {
      ...body, id, exercises, rest: null,
      title: title.endsWith(`(${KEPT_COPY_NOTE})`) ? title : `${title} (${KEPT_COPY_NOTE})`,
      endMs: typeof body.endMs === 'number' ? body.endMs : lastDone,
      keptCopyOf: body.keptCopyOf ?? lost.id,
    },
  };
}

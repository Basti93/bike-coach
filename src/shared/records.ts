export type RecordKind = 'workout' | 'routine' | 'exercise' | 'mobility' | 'complaint' | 'plan';
export type TrackedRecord = { kind: RecordKind; id: string; updatedMs: number; deleted: boolean; body: unknown };

export type LoggedSet = { type: 'warmup' | 'normal' | 'failure' | 'dropset'; weightKg: number | null; reps: number | null; durationS: number | null; doneMs: number | null };
export type LoggedExercise = { exerciseId: string; title: string; supersetId: number | null; notes: string; sets: LoggedSet[] };
export type LoggedWorkout = { id: string; title: string; startMs: number; endMs: number | null; source: 'pandafit' | 'hevy'; exercises: LoggedExercise[]; /** Set on a kept copy (see tracking/kept-copy): the record this version of the session came from. */ keptCopyOf?: string };

/** Newer wins; a tie goes to the greater JSON text so every device ends the same. The loser is returned, never dropped silently. */
export function applyRecord(current: TrackedRecord | undefined, incoming: TrackedRecord): { keep: TrackedRecord; overwritten: TrackedRecord | null } {
  if (!current) return { keep: incoming, overwritten: null };
  if (current.kind !== incoming.kind || current.id !== incoming.id) throw new Error('applyRecord: records differ in kind or id');
  const a = JSON.stringify(current), b = JSON.stringify(incoming);
  if (a === b) return { keep: current, overwritten: null };
  const incomingWins = incoming.updatedMs !== current.updatedMs ? incoming.updatedMs > current.updatedMs : b > a;
  return incomingWins ? { keep: incoming, overwritten: current } : { keep: current, overwritten: incoming };
}

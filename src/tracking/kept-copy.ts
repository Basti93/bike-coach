import { applyRecord, type LoggedWorkout, type TrackedRecord } from '../shared/records';
import type { PutResult } from './ports';

export const KEPT_COPY_NOTE = 'aufbewahrte Kopie von einem anderen Gerät';

const bodyOf = (r: TrackedRecord): Partial<LoggedWorkout> => (typeof r.body === 'object' && r.body !== null ? r.body as Partial<LoggedWorkout> : {});

/** Confirmed sets in a record. */
function confirmedSets(r: TrackedRecord): number {
  const { exercises } = bodyOf(r);
  if (!Array.isArray(exercises)) return 0;
  return exercises.flatMap((e) => (Array.isArray(e?.sets) ? e.sets : [])).filter((s) => typeof s?.doneMs === 'number').length;
}

const setsWeighed = (r: TrackedRecord): number => (r.deleted ? 0 : confirmedSets(r));

/**
 * What stays of a version that is about to be replaced by one holding fewer confirmed sets (a tombstone holds none): its
 * own finished record, derived only from that version. Whichever device or retry writes it, it is the same text under
 * the same id, so there is never a second copy. Hevy's workouts stay in Hevy, a tombstone holds nothing to keep. It has
 * no base: it is a new record, nothing it could conflict with exists yet.
 */
function keptCopy(lost: TrackedRecord, winner: TrackedRecord): TrackedRecord | null {
  const body = bodyOf(lost);
  if (lost.kind !== 'workout' || lost.deleted || body.source === 'hevy' || !Array.isArray(body.exercises)) return null;
  if (confirmedSets(lost) <= setsWeighed(winner)) return null;
  const exercises = body.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => typeof s.doneMs === 'number') })).filter((e) => e.sets.length > 0);
  const lastDone = Math.max(...exercises.flatMap((e) => e.sets.map((s) => s.doneMs as number)));
  const id = `${lost.id}-kopie-${lost.updatedMs}`;
  const title = String(body.title ?? '');
  const { baseMs: _base, ...rest } = body;
  return {
    kind: 'workout', id, updatedMs: lost.updatedMs, deleted: false,
    body: {
      ...rest, id, exercises, rest: null,
      title: title.endsWith(`(${KEPT_COPY_NOTE})`) ? title : `${title} (${KEPT_COPY_NOTE})`,
      endMs: typeof body.endMs === 'number' ? body.endMs : lastDone,
      keptCopyOf: body.keptCopyOf ?? lost.id,
    },
  };
}

/** A version this device holds, with what it knows of the server: the `updatedMs` of the last version sent and acknowledged, or received. */
export type Held = { rec: TrackedRecord; serverMs?: number };
/**
 * - `local`: a write made here. `seenMs` is the version the writer stands on, when it knows one.
 * - `remote`: a version from the server.
 * - `import`: written as given, never a conflict (Hevy imports, the Mac's own exports).
 */
export type WriteOrigin = { from: 'local'; seenMs?: number } | { from: 'remote' } | { from: 'import' };
export type WritePlan = {
  /** What was offered, with its base stamped for a local workout write. */
  incoming: TrackedRecord;
  /** The record that stays. */
  keep: TrackedRecord;
  /** `keep` differs from what was held, so the store writes it. */
  replaces: boolean;
  overwritten: TrackedRecord | null;
  serverMs: number | undefined;
  /** Written before or with the replacement, when the replaced version was not known to the writer and held more sets. */
  copy: TrackedRecord | null;
  result: PutResult;
};

const withBase = (r: TrackedRecord, baseMs: number | undefined): TrackedRecord => {
  if (r.kind !== 'workout' || typeof r.body !== 'object' || r.body === null) return r;
  const { baseMs: _old, ...rest } = r.body as { baseMs?: number };
  return { ...r, body: baseMs === undefined ? rest : { ...rest, baseMs } };
};

/**
 * The one conflict rule, for every store and every way a version gets replaced. `baseMs` says which server version a
 * record was made on. A version made on the one being replaced is a legit change, whatever it removed. Any other
 * replacement with fewer confirmed sets is a conflict, and the replaced version stays as a copy. No base, no conflict.
 */
export function planWrite(have: Held | undefined, r: TrackedRecord, origin: WriteOrigin): WritePlan {
  const held = have?.rec;
  let incoming = r;
  let unseen = false;
  if (origin.from === 'local') {
    // A write standing on the held version carries what this device knows of the server, and stays in its chain of edits.
    // One standing on something else carries that: every device holding a version other than that one will see the conflict.
    unseen = held !== undefined && origin.seenMs !== undefined && origin.seenMs !== held.updatedMs;
    incoming = withBase(r, unseen ? origin.seenMs : have?.serverMs);
  }
  const { keep, overwritten } = applyRecord(held, incoming);
  const replaces = !held || keep !== held;
  const base = (incoming.body as { baseMs?: unknown } | null)?.baseMs;
  const conflict = origin.from === 'remote' ? typeof base === 'number' && base !== held?.updatedMs : unseen;
  return {
    incoming, keep, replaces, overwritten,
    serverMs: origin.from === 'remote' ? r.updatedMs : have?.serverMs,
    copy: held && replaces && conflict ? keptCopy(held, incoming) : null,
    result: { kept: replaces || JSON.stringify(held) === JSON.stringify(incoming), updatedMs: keep.updatedMs },
  };
}

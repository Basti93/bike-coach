import type { Exercise, ExerciseProposal } from '../shared/exercises';
import { aiExerciseId, isObj, linkId, linkOf, linkRecord, tombstone, type ExerciseLink } from '../shared/exercise-links';
import type { TrackedRecord } from '../shared/records';

const DAY_MS = 86_400_000;
/** A link stays changeable and undoable on screen this long. */
export const AUTO_LINK_DAYS = 14;

/** The proposal a record carries, or null (also for a deleted record or a malformed one). */
export function proposalOf(r: TrackedRecord): ExerciseProposal | null {
  const p = !r.deleted && isObj(r.body) ? r.body.proposal : null;
  if (!isObj(p) || typeof p.forTitle !== 'string' || p.forTitle === '' || (p.kind !== 'same' && p.kind !== 'new')) return null;
  return { forTitle: p.forTitle, kind: p.kind, targetId: typeof p.targetId === 'string' ? p.targetId : undefined, reason: typeof p.reason === 'string' ? p.reason : '', atMs: typeof p.atMs === 'number' ? p.atMs : 0 };
}

/** A live link record that is recent enough to be changed or undone, or null. */
export function recentLinkOf(r: TrackedRecord, nowMs: number): ExerciseLink | null {
  const l = linkOf(r);
  return l && nowMs - l.atMs <= AUTO_LINK_DAYS * DAY_MS ? l : null;
}

const linkFor = (title: string, targetId: string, records: TrackedRecord[], nowMs: number): TrackedRecord =>
  linkRecord(title, targetId, 'person', nowMs, records.find((r) => r.id === linkId(title)));

/**
 * Takes the coach's proposal as it is. `same`: the title becomes a link to the target. `new`: the proposed exercise is written under a fresh
 * id (`source: 'ai'`) and the title is linked to it. The proposal is withdrawn either way. `records` are the exercise records as stored,
 * `catalog` the merged catalog. Nothing to write when the proposal does not hold (no target any more).
 */
export function confirmProposal(p: TrackedRecord, catalog: Exercise[], nowMs: number, records: TrackedRecord[]): TrackedRecord[] {
  const prop = proposalOf(p);
  if (!prop || !isObj(p.body)) return [];
  if (prop.kind === 'new') {
    const id = aiExerciseId(prop.forTitle, nowMs);
    const { proposal: _gone, ...rest } = p.body;
    return [
      { kind: 'exercise', id, updatedMs: nowMs, deleted: false, body: { ...rest, id, source: 'ai' } },
      linkFor(prop.forTitle, id, records, nowMs),
      tombstone(p, nowMs),
    ];
  }
  return prop.targetId ? changeProposal(p, prop.targetId, catalog, nowMs, records) : [];
}

/** Like confirming a `same` proposal, but to the exercise the person chose. */
export function changeProposal(p: TrackedRecord, targetId: string, catalog: Exercise[], nowMs: number, records: TrackedRecord[]): TrackedRecord[] {
  const prop = proposalOf(p);
  if (!prop || !catalog.some((e) => e.id === targetId)) return [];
  return [linkFor(prop.forTitle, targetId, records, nowMs), tombstone(p, nowMs)];
}

/** Neither: the proposal is withdrawn and not made again for a while. */
export function rejectProposal(p: TrackedRecord, nowMs: number): TrackedRecord[] {
  return proposalOf(p) ? [tombstone(p, nowMs)] : [];
}

/** Moves a recent link to another exercise in one write; the person chose it, so it counts as theirs. */
export function relink(link: TrackedRecord, targetId: string, catalog: Exercise[], nowMs: number): TrackedRecord[] {
  const l = recentLinkOf(link, nowMs);
  if (!l || l.targetId === targetId || !catalog.some((e) => e.id === targetId)) return [];
  return [linkRecord(l.title, targetId, 'person', nowMs, link)];
}

/** Takes a recent link back: the title is no name of the exercise any more, and the coach only proposes it from then on. */
export function undoLink(link: TrackedRecord, nowMs: number): TrackedRecord[] {
  return recentLinkOf(link, nowMs) ? [tombstone(link, nowMs)] : [];
}

/**
 * Like `undoLink`, and when the link led to an exercise the coach made (`source: 'ai'`) that no workout uses and no other link
 * points to, that exercise is withdrawn too, so confirming and undoing leaves nothing behind. `exercises` and `workouts` are the stored records.
 */
export function undoLinkAndUnused(link: TrackedRecord, nowMs: number, exercises: TrackedRecord[], workouts: TrackedRecord[]): TrackedRecord[] {
  const out = undoLink(link, nowMs);
  const l = linkOf(link);
  if (out.length === 0 || !l) return out;
  const target = exercises.find((r) => r.id === l.targetId && !r.deleted);
  if (!target || !isObj(target.body) || target.body.source !== 'ai' || linkOf(target)) return out;
  const usedByWorkout = workouts.some((w) => !w.deleted && isObj(w.body) && Array.isArray(w.body.exercises) && w.body.exercises.some((e) => isObj(e) && e.exerciseId === target.id));
  const otherLink = exercises.some((r) => r.id !== link.id && !r.deleted && linkOf(r)?.targetId === target.id);
  return usedByWorkout || otherLink ? out : [...out, tombstone(target, nowMs)];
}

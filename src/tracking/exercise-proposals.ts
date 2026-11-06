import type { Exercise, ExerciseProposal } from '../shared/exercises';
import type { TrackedRecord } from '../shared/records';

const DAY_MS = 86_400_000;
/** An auto link stays undoable on screen this long. */
export const AUTO_LINK_DAYS = 14;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s !== '') : []);
const union = (a: string[], extra: string): string[] => [...new Set([...a, extra])];
const above = (now: number, have: TrackedRecord | undefined): number => Math.max(now, (have?.updatedMs ?? 0) + 1);

/** The proposal a record carries, or null (also for a deleted record or a malformed one). */
export function proposalOf(r: TrackedRecord): ExerciseProposal | null {
  const p = !r.deleted && isObj(r.body) ? r.body.proposal : null;
  if (!isObj(p) || typeof p.forTitle !== 'string' || p.forTitle === '' || (p.kind !== 'same' && p.kind !== 'new')) return null;
  return { forTitle: p.forTitle, kind: p.kind, targetId: typeof p.targetId === 'string' ? p.targetId : undefined, reason: typeof p.reason === 'string' ? p.reason : '', atMs: typeof p.atMs === 'number' ? p.atMs : 0 };
}

/** An overlay's recent auto link that is still in force, or null. */
export function autoLinkOf(r: TrackedRecord, nowMs: number): { title: string; atMs: number } | null {
  if (r.deleted || !isObj(r.body) || r.body.proposal !== undefined || !isObj(r.body.lastAutoLink)) return null;
  const { title, atMs } = r.body.lastAutoLink;
  if (typeof title !== 'string' || typeof atMs !== 'number' || nowMs - atMs > AUTO_LINK_DAYS * DAY_MS) return null;
  return strings(r.body.aliases).includes(title) ? { title, atMs } : null;
}

/** The exercise record `id` points at, if it is a real one (not a proposal, not deleted): the body an overlay has to keep. */
function baseBody(id: string, records: TrackedRecord[]): { have: TrackedRecord | undefined; body: Record<string, unknown> } {
  const have = records.find((r) => r.id === id);
  const body = have && !have.deleted && isObj(have.body) && have.body.proposal === undefined ? have.body : {};
  return { have, body };
}

/** An overlay on `targetId` that knows `title` as another name. Everything the record already says stays. */
function linkTo(targetId: string, title: string, records: TrackedRecord[], nowMs: number): TrackedRecord {
  const { have, body } = baseBody(targetId, records);
  const undoneTitles = strings(body.undoneTitles).filter((t) => t !== title);
  const next: Record<string, unknown> = { ...body, id: targetId, aliases: union(strings(body.aliases), title), lastAutoLink: { title, atMs: nowMs } };
  if (undoneTitles.length > 0) next.undoneTitles = undoneTitles; else delete next.undoneTitles;
  return { kind: 'exercise', id: targetId, updatedMs: above(nowMs, have), deleted: false, body: next };
}

const withdrawn = (p: TrackedRecord, nowMs: number): TrackedRecord => ({ ...p, updatedMs: above(nowMs, p), deleted: true });

/**
 * Takes the coach's proposal as it is. `same`: the title becomes an alias of the target and the proposal is withdrawn. `new`: the
 * proposal record itself becomes the exercise (without `proposal`, by `ai`) and also knows the logged title. `records` are the exercise
 * records as stored, `catalog` the merged catalog. Nothing to write when the proposal does not hold (no target any more).
 */
export function confirmProposal(p: TrackedRecord, catalog: Exercise[], nowMs: number, records: TrackedRecord[]): TrackedRecord[] {
  const prop = proposalOf(p);
  if (!prop || !isObj(p.body)) return [];
  if (prop.kind === 'new') {
    const { proposal: _gone, ...rest } = p.body;
    return [{ ...p, updatedMs: above(nowMs, p), deleted: false, body: { ...rest, source: 'ai', aliases: union(strings(rest.aliases), prop.forTitle), lastAutoLink: { title: prop.forTitle, atMs: nowMs } } }];
  }
  return prop.targetId ? changeProposal(p, prop.targetId, catalog, nowMs, records) : [];
}

/** Like confirming a `same` proposal, but to the exercise the person chose. */
export function changeProposal(p: TrackedRecord, targetId: string, catalog: Exercise[], nowMs: number, records: TrackedRecord[]): TrackedRecord[] {
  const prop = proposalOf(p);
  if (!prop || !catalog.some((e) => e.id === targetId)) return [];
  return [linkTo(targetId, prop.forTitle, records, nowMs), withdrawn(p, nowMs)];
}

/** Moves a recent link to another exercise in one step: the title leaves the old target (it is not undone, only wrong) and becomes an alias of the new one. */
export function relink(overlay: TrackedRecord, targetId: string, catalog: Exercise[], nowMs: number, records: TrackedRecord[]): TrackedRecord[] {
  const link = autoLinkOf(overlay, nowMs);
  if (!link || !isObj(overlay.body) || overlay.id === targetId || !catalog.some((e) => e.id === targetId)) return [];
  const { lastAutoLink: _gone, ...rest } = overlay.body;
  const old: TrackedRecord = { ...overlay, updatedMs: above(nowMs, overlay), body: { ...rest, aliases: strings(rest.aliases).filter((a) => a !== link.title) } };
  return [old, linkTo(targetId, link.title, records, nowMs)];
}

/** Takes back an auto link: the title is no name of the exercise any more, and the coach is told it is never to link it by itself again. */
export function undoAutoLink(overlay: TrackedRecord, nowMs: number): TrackedRecord[] {
  if (overlay.deleted || !isObj(overlay.body) || !isObj(overlay.body.lastAutoLink) || typeof overlay.body.lastAutoLink.title !== 'string') return [];
  const title = overlay.body.lastAutoLink.title;
  const { lastAutoLink: _gone, ...rest } = overlay.body;
  return [{ ...overlay, updatedMs: above(nowMs, overlay), body: { ...rest, aliases: strings(rest.aliases).filter((a) => a !== title), undoneTitles: union(strings(rest.undoneTitles), title) } }];
}

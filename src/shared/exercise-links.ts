import type { TrackedRecord } from './records';

export const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
export const str = (x: unknown): x is string => typeof x === 'string' && x !== '';
export const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s !== '') : []);

/** Small deterministic FNV-1a hash, hex. Only names records after a title. */
export function titleHash(title: string): string {
  let h = 0x811c9dc5;
  for (const ch of title) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** The next time stamp for a record: now, but always above what the record had, so a rewrite wins. */
export const above = (nowMs: number, have: TrackedRecord | undefined): number => Math.max(nowMs, (have?.updatedMs ?? 0) + 1);

/**
 * A logged title that is another name of a catalog exercise. One `exercise` record per title: `link-<hash(title)>`. Two people
 * linking different titles write different records, so nothing is lost when the records are mirrored. A deleted link record means "undone".
 */
export type ExerciseLink = { title: string; targetId: string; by: 'auto' | 'person'; atMs: number };

export const linkId = (title: string): string => `link-${titleHash(title.trim())}`;
export const proposalId = (title: string, atMs: number): string => `prop-${titleHash(title.trim())}-${atMs.toString(36)}`;
export const aiExerciseId = (title: string, atMs: number): string => `ai-${titleHash(title.trim())}-${atMs.toString(36)}`;

/** True for a link record, live or deleted. */
export const isLinkRecord = (r: TrackedRecord): boolean => isObj(r.body) && r.body.kind === 'link';

/** The link a live link record holds, or null (deleted, malformed or not a link record). */
export function linkOf(r: TrackedRecord): ExerciseLink | null {
  if (r.deleted || !isObj(r.body) || r.body.kind !== 'link') return null;
  const { title, targetId, by, atMs } = r.body;
  if (!str(title) || !str(targetId)) return null;
  return { title, targetId, by: by === 'person' ? 'person' : 'auto', atMs: typeof atMs === 'number' ? atMs : 0 };
}

/** The record that links `title` to `targetId`. `have` is the title's earlier link record (live or deleted), which it replaces. */
export function linkRecord(title: string, targetId: string, by: ExerciseLink['by'], nowMs: number, have?: TrackedRecord): TrackedRecord {
  const t = title.trim();
  const id = linkId(t);
  return { kind: 'exercise', id, updatedMs: above(nowMs, have), deleted: false, body: { id, kind: 'link', title: t, targetId, by, atMs: nowMs } satisfies Record<string, unknown> };
}

/** The same record, deleted: "undone" (or withdrawn). */
export const tombstone = (r: TrackedRecord, nowMs: number): TrackedRecord => ({ ...r, updatedMs: above(nowMs, r), deleted: true });

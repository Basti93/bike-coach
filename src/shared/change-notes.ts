/** What a coach changed on its own that lasts, and why. One line each; shown on the week page ("Zuletzt geändert"). */
export type ChangeNote = { atMs: number; coach: 'bike' | 'gym' | 'run' | 'chat'; text: string; reason: string };
/** A note as a coach keeps it: `key` says what it is about, so a new plan for the same thing replaces its note instead of adding one. */
export type KeyedNote = ChangeNote & { key: string };

/** At most this many notes per coach, and none older than this. */
export const NOTES_PER_COACH = 20;
export const NOTES_KEEP_MS = 60 * 86_400_000;
/** The newest notes across the coaches that are published. */
export const NOTES_PUBLISHED = 8;

const COACHES: readonly string[] = ['bike', 'gym', 'run', 'chat'];
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The list with the note put in: a note with the same key is replaced, old ones are dropped, the newest NOTES_PER_COACH stay. */
export function addNote<T extends ChangeNote & { key?: string }>(list: readonly T[], note: T, nowMs: number): T[] {
  // The same note again stays as it is, with its time: writing it once is the point.
  if (note.key !== undefined && list.some((n) => n.key === note.key && n.text === note.text && n.reason === note.reason)) return [...list];
  const kept = list.filter((n) => (note.key === undefined || n.key !== note.key) && nowMs - n.atMs <= NOTES_KEEP_MS);
  return [...kept, note].sort((a, b) => a.atMs - b.atMs).slice(-NOTES_PER_COACH);
}

/** Notes from the cap and age rules alone (for lists that were built elsewhere, like the bike's own changes). */
export function capNotes<T extends ChangeNote>(list: readonly T[], nowMs: number): T[] {
  return list.filter((n) => nowMs - n.atMs <= NOTES_KEEP_MS).sort((a, b) => a.atMs - b.atMs).slice(-NOTES_PER_COACH);
}

/** The newest notes of all coaches, newest first. */
export const newestNotes = (notes: readonly ChangeNote[], n = NOTES_PUBLISHED): ChangeNote[] => [...notes].sort((a, b) => b.atMs - a.atMs).slice(0, n);

/** Stored or published notes; an entry that is not whole is dropped, never the list. */
export function readNotes(x: unknown): ChangeNote[] {
  if (!Array.isArray(x)) return [];
  return x.slice(0, 60).flatMap((n): ChangeNote[] => {
    if (!isObj(n) || typeof n.atMs !== 'number' || !Number.isFinite(n.atMs) || !COACHES.includes(n.coach as string)) return [];
    if (typeof n.text !== 'string' || n.text.length === 0 || n.text.length > 300 || typeof n.reason !== 'string' || n.reason.length > 300) return [];
    return [{ atMs: n.atMs, coach: n.coach as ChangeNote['coach'], text: n.text, reason: n.reason }];
  });
}

/** The same for what a coach keeps (with keys). */
export function readKeyedNotes(x: unknown): KeyedNote[] {
  if (!Array.isArray(x)) return [];
  return x.slice(0, 60).flatMap((n): KeyedNote[] => {
    const [note] = readNotes([n]);
    return note ? [{ ...note, key: isObj(n) && typeof n.key === 'string' ? n.key : '' }] : [];
  });
}

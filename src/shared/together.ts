/**
 * The together page as a record of the kind `together`, id `current`, one per linked account. The Mac (later the
 * server's coach) writes it; the phone only reads it. It holds only what the Mac's together page shows both people
 * today, and less: no watts, no health, no notes or complaints, no ranking line and no streaks.
 */
export const TOGETHER_ID = 'current';

export type TogetherPerson = { profileId: string; name: string; ridesThisWeek: number; minutesThisWeek: number; wordsLearned: number; /** Minutes per week, the last 12 weeks, the current week last. */ weeks: number[] };
export type TogetherBody = {
  /** Start of the week (Monday, UTC) that "this week" means here. */
  week: number;
  /** When what the record says last changed: the data date the phone shows. */
  atMs: number;
  /** The profile of the account this copy is for. */
  you: string;
  people: TogetherPerson[];
  recent: { name: string; startedAtMs: number; sessionName?: string; minutes: number }[];
  metres: number; lastRideMetres: number;
  peak: { name: string; done: number; total: number; next: string };
  summits: { name: string; atMs: number }[];
  climbed: { who: string; name: string; atMs: number }[];
  climbing: { who: string; name: string; pct: number }[];
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const str = (x: unknown): x is string => typeof x === 'string';
const list = <T>(x: unknown, ok: (e: Record<string, unknown>) => boolean): x is T[] => Array.isArray(x) && x.every((e) => isObj(e) && ok(e));

/** A body the phone can draw without throwing, or null. */
export function readTogether(b: unknown): TogetherBody | null {
  if (!isObj(b) || !num(b.week) || !num(b.atMs) || !str(b.you) || !num(b.metres) || !num(b.lastRideMetres)) return null;
  const p = b.peak;
  if (!isObj(p) || !str(p.name) || !num(p.done) || !num(p.total) || p.total <= 0 || !str(p.next)) return null;
  if (!list(b.people, (e) => str(e.profileId) && str(e.name) && num(e.ridesThisWeek) && num(e.minutesThisWeek) && num(e.wordsLearned) && Array.isArray(e.weeks) && e.weeks.every(num))) return null;
  if (!list(b.recent, (e) => str(e.name) && num(e.startedAtMs) && num(e.minutes) && (e.sessionName === undefined || str(e.sessionName)))) return null;
  if (!list(b.summits, (e) => str(e.name) && num(e.atMs))) return null;
  if (!list(b.climbed, (e) => str(e.who) && str(e.name) && num(e.atMs))) return null;
  if (!list(b.climbing, (e) => str(e.who) && str(e.name) && num(e.pct))) return null;
  return b as unknown as TogetherBody;
}

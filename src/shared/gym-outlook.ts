/** The gym coach's sketch of the workouts after the next one, and where the training is heading. No weights: they follow progress. */
export type OutlookSession = { date: string | null; name: string; focus: string; exercises: { title: string; sets: number }[] };
export type GymOutlook = { direction: string; sessions: OutlookSession[] };

const MAX_SESSIONS = 4;
const MAX_EXERCISES = 10;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown, max: number): string => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/** A clean outlook, or null when nothing usable is in it. Anything odd in a session or exercise is left out. */
export function readOutlook(x: unknown): GymOutlook | null {
  if (!isObj(x) || !Array.isArray(x.sessions)) return null;
  const sessions = x.sessions.slice(0, MAX_SESSIONS).flatMap((s): OutlookSession[] => {
    if (!isObj(s) || !Array.isArray(s.exercises)) return [];
    const name = text(s.name, 80);
    const exercises = s.exercises.slice(0, MAX_EXERCISES).flatMap((e) => {
      if (!isObj(e)) return [];
      const title = text(e.title, 80);
      const sets = typeof e.sets === 'number' && Number.isFinite(e.sets) ? Math.round(e.sets) : 0;
      return title && sets >= 1 && sets <= 10 ? [{ title, sets }] : [];
    });
    if (!name || exercises.length === 0) return [];
    const date = typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : null;
    return [{ date, name, focus: text(s.focus, 120), exercises }];
  });
  const direction = text(x.direction, 300);
  return sessions.length > 0 || direction ? { direction, sessions } : null;
}

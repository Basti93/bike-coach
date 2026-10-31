import { learnedCount } from '../shared/language';
import type { Profile } from '../shared/profiles';
import type { CoachState } from './state';

/** Spielregel: Jede Minute zählt für alle gleich, egal mit wie viel Watt. Das entspricht einem gemütlichen Bergtempo. */
export const METRES_PER_MINUTE = 10;
const PEAKS = [
  { name: 'Alpe d’Huez', metres: 1100 },
  { name: 'Mont Ventoux', metres: 1600 },
  { name: 'Stilfser Joch', metres: 1800 },
  { name: 'Mount Everest', metres: 8850 },
];
const WEEK = 7 * 86_400_000;
const MONDAY_OFFSET = 4 * 86_400_000; // Der 1.1.1970 war ein Donnerstag.
export const weekOf = (ms: number): number => Math.floor((ms - MONDAY_OFFSET) / WEEK);
export const weekStartMs = (week: number): number => week * WEEK + MONDAY_OFFSET;

export type PersonStats = { profileId: string; name: string; ridesThisWeek: number; minutesThisWeek: number; streakWeeks: number; wordsLearned: number };
export type Together = {
  people: PersonStats[]; metres: number; lastRideMetres: number; line: string | null;
  peak: { name: string; done: number; total: number; next: string | null };
};

const streak = (s: CoachState, nowMs: number): number => {
  const weeks = new Set(s.summaries.map((r) => weekOf(r.startedAtMs)));
  let week = weekOf(nowMs);
  if (!weeks.has(week)) week--; // Die laufende Woche bricht keine Serie, sie ist nur noch nicht geschafft.
  let n = 0;
  while (weeks.has(week)) { n++; week--; }
  return n;
};

const friendlyLine = (people: PersonStats[]): string | null => {
  if (people.length < 2) return null;
  const [a, b] = [...people].sort((x, y) => y.ridesThisWeek - x.ridesThisWeek);
  if (a.ridesThisWeek === 0) return 'Neue Woche, neues Glück. Wer fängt an?';
  if (a.ridesThisWeek === b.ridesThisWeek) return `Gleichstand diese Woche. ${a.name} und ${b.name} bleiben sich auf den Fersen.`;
  return `${a.name} legt diese Woche vor. ${b.name}, das Rad wartet schon.`;
};

/** Nur Dinge, die beide gleich beeinflussen können. Watt und FTP kommen hier bewusst nicht vor. */
export const computeTogether = (profiles: Profile[], states: CoachState[], nowMs: number): Together => {
  const people = states.map((s): PersonStats => {
    const thisWeek = s.summaries.filter((r) => weekOf(r.startedAtMs) === weekOf(nowMs));
    return {
      profileId: s.profileId, name: profiles.find((p) => p.id === s.profileId)?.name ?? '',
      ridesThisWeek: thisWeek.length, minutesThisWeek: Math.round(thisWeek.reduce((a, r) => a + r.durationS, 0) / 60),
      streakWeeks: streak(s, nowMs), wordsLearned: learnedCount(s.wordProgress ?? {}),
    };
  });
  const rides = states.flatMap((s) => s.summaries);
  const metres = Math.round(rides.reduce((a, r) => a + r.durationS, 0) / 60) * METRES_PER_MINUTE;
  const latest = [...rides].sort((a, b) => b.startedAtMs - a.startedAtMs)[0];
  let left = metres, i = 0;
  while (i < PEAKS.length - 1 && left >= PEAKS[i].metres) left -= PEAKS[i++].metres;
  return {
    people, metres, lastRideMetres: latest ? Math.round(latest.durationS / 60) * METRES_PER_MINUTE : 0, line: friendlyLine(people),
    peak: { name: PEAKS[i].name, done: Math.min(left, PEAKS[i].metres), total: PEAKS[i].metres, next: PEAKS[i + 1]?.name ?? null },
  };
};

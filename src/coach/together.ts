import { learnedCount } from '../shared/language';
import { PASSES } from '../shared/passes';
import type { Profile } from '../shared/profiles';
import type { CoachState } from './state';

/** Rule of the game: every minute counts the same for everyone, regardless of the watts. That corresponds to a comfortable climbing pace. */
export const METRES_PER_MINUTE = 10;
const PEAKS = [
  { name: 'Alpe d’Huez', metres: 1100 },
  { name: 'Mont Ventoux', metres: 1600 },
  { name: 'Stilfser Joch', metres: 1800 },
  { name: 'Mount Everest', metres: 8850 },
];
const RHYTHM_WEEKS = 12;
const RECENT = 8;
const WEEK = 7 * 86_400_000;
const MONDAY_OFFSET = 4 * 86_400_000; // January 1, 1970 was a Thursday.
export const weekOf = (ms: number): number => Math.floor((ms - MONDAY_OFFSET) / WEEK);
export const weekStartMs = (week: number): number => week * WEEK + MONDAY_OFFSET;

export type PersonStats = { profileId: string; name: string; ridesThisWeek: number; minutesThisWeek: number; streakWeeks: number; wordsLearned: number; weeks: number[] };
export type Together = {
  recent: { name: string; startedAtMs: number; sessionName?: string; minutes: number }[];
  people: PersonStats[]; metres: number; lastRideMetres: number; line: string | null;
  peak: { name: string; done: number; total: number; next: string };
  /** Mountains reached together, oldest first. Deliberately without shares per person. */
  summits: { name: string; atMs: number }[];
  /** Real mountains climbed, by person. Time on a mountain is not compared. */
  climbed: { who: string; name: string; atMs: number }[];
};

const streak = (s: CoachState, nowMs: number): number => {
  const weeks = new Set(s.summaries.map((r) => weekOf(r.startedAtMs)));
  let week = weekOf(nowMs);
  if (!weeks.has(week)) week--; // The current week does not break a streak, it just is not done yet.
  let n = 0;
  while (weeks.has(week)) { n++; week--; }
  return n;
};

/** After the last mountain the list starts again, so the way never ends. */
const peakAt = (i: number) => {
  const round = Math.floor(i / PEAKS.length) + 1;
  const peak = PEAKS[i % PEAKS.length];
  return { name: round === 1 ? peak.name : `${peak.name}, ${round}. Mal`, metres: peak.metres };
};

const friendlyLine = (people: PersonStats[]): string | null => {
  if (people.length < 2) return null;
  const [a, b] = [...people].sort((x, y) => y.ridesThisWeek - x.ridesThisWeek);
  if (a.ridesThisWeek === 0) return 'Eine neue Woche wartet. Wer tritt zuerst in die Pedale?';
  if (a.ridesThisWeek === b.ridesThisWeek) return `Gleichstand diese Woche. ${a.name} und ${b.name} sind ein gutes Team.`;
  return `${a.name} legt diese Woche vor. ${b.name}, dein Rad freut sich schon auf dich.`;
};

/** Only things both can influence equally. Watts and FTP are deliberately left out here. */
export const computeTogether = (profiles: Profile[], states: CoachState[], nowMs: number): Together => {
  const people = states.map((s): PersonStats => {
    const thisWeek = s.summaries.filter((r) => weekOf(r.startedAtMs) === weekOf(nowMs));
    return {
      profileId: s.profileId, name: profiles.find((p) => p.id === s.profileId)?.name ?? '',
      ridesThisWeek: thisWeek.length, minutesThisWeek: Math.round(thisWeek.reduce((a, r) => a + r.durationS, 0) / 60),
      streakWeeks: streak(s, nowMs), wordsLearned: learnedCount(s.wordProgress ?? {}),
      weeks: Array.from({ length: RHYTHM_WEEKS }, (_, i) => Math.round(s.summaries.filter((r) => weekOf(r.startedAtMs) === weekOf(nowMs) - (RHYTHM_WEEKS - 1 - i)).reduce((a, r) => a + r.durationS, 0) / 60)),
    };
  });
  const rides = states.flatMap((s) => s.summaries);
  const metres = Math.round(rides.reduce((a, r) => a + r.durationS, 0) / 60) * METRES_PER_MINUTE;
  const latest = [...rides].sort((a, b) => b.startedAtMs - a.startedAtMs)[0];
  const summits: Together['summits'] = [];
  let i = 0, reached = 0, seconds = 0;
  for (const r of [...rides].sort((a, b) => a.startedAtMs - b.startedAtMs)) {
    seconds += r.durationS;
    const soFar = Math.round(seconds / 60) * METRES_PER_MINUTE;
    while (soFar - reached >= peakAt(i).metres) {
      reached += peakAt(i).metres;
      summits.push({ name: peakAt(i).name, atMs: r.startedAtMs });
      i++;
    }
  }
  const recent = states.flatMap((s) => s.summaries.map((r) => ({
    name: profiles.find((p) => p.id === s.profileId)?.name ?? '', startedAtMs: r.startedAtMs,
    ...(r.sessionName ? { sessionName: r.sessionName } : {}), minutes: Math.round(r.durationS / 60),
  }))).sort((a, b) => b.startedAtMs - a.startedAtMs).slice(0, RECENT);
  return {
    recent, people, metres, lastRideMetres: latest ? Math.round(latest.durationS / 60) * METRES_PER_MINUTE : 0, line: friendlyLine(people),
    peak: { name: peakAt(i).name, done: metres - reached, total: peakAt(i).metres, next: peakAt(i + 1).name },
    summits,
    climbed: states.flatMap((s) => (s.pass?.summits ?? []).flatMap((c) => {
      const pass = PASSES.find((p) => p.id === c.passId);
      return pass ? [{ who: profiles.find((p) => p.id === s.profileId)?.name ?? '', name: pass.name, atMs: c.atMs }] : [];
    })).sort((a, b) => b.atMs - a.atMs),
  };
};

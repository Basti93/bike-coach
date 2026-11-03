import { SPORTS, type Sport, type StatsDay } from '../../shared/stats';
import { dateKey, type DayRating } from '../day-load';

export type StatsInput = {
  rides: { startedAtMs: number; durationS: number }[];
  strength: { startMs: number; durationS: number }[];
  runs: { startMs: number; durationS: number }[];
  mobility: { doneMs: number; minutes: number }[];
  other: { startMs: number; durationS: number; sport: string }[];
  ratings: Record<string, DayRating>;
};

const DAY_MINUTES = 1440;

/** Minutes per sport per date, hardness and legs from the ratings. Removing doubles across sources is the caller's job. */
export function statsDays(input: StatsInput, dates: string[]): StatsDay[] {
  const days = new Map<string, Record<Sport, number>>(dates.map((d) => [d, Object.fromEntries(SPORTS.map((s) => [s, 0])) as Record<Sport, number>]));
  const add = (ms: number, sport: Sport, minutes: number): void => {
    // A broken value is left out, so one bad entry cannot make the whole record invalid.
    if (!Number.isFinite(ms) || !Number.isFinite(minutes) || minutes <= 0) return;
    const day = days.get(dateKey(ms));
    if (day) day[sport] += minutes;
  };
  for (const r of input.rides) add(r.startedAtMs, 'bike', r.durationS / 60);
  for (const w of input.strength) add(w.startMs, 'strength', w.durationS / 60);
  for (const r of input.runs) add(r.startMs, 'run', r.durationS / 60);
  for (const m of input.mobility) add(m.doneMs, 'mobility', m.minutes);
  for (const o of input.other) add(o.startMs, 'other', o.durationS / 60);
  return dates.map((date) => {
    const minutes = days.get(date)!;
    // Each sport and the day as a whole stay within a day: a multi-day activity counts as one full day.
    let left = DAY_MINUTES;
    for (const s of SPORTS) {
      minutes[s] = Math.min(Math.round(minutes[s]), left);
      left -= minutes[s];
    }
    const rating = input.ratings[date];
    return { date, minutes, hardness: rating?.hardness ?? null, legs: rating?.legs ?? false };
  });
}

/** Local dates from the Monday 8 weeks before this week's Monday up to and including today. */
export const lastDates = (nowMs: number, weeks = 9): string[] => {
  const now = new Date(nowMs);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - (weeks - 1) * 7);
  const out: string[] = [];
  for (let d = monday; d <= now; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(dateKey(d.getTime()));
  return out;
};

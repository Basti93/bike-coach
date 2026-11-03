import type { Profile } from '../../shared/profiles';
import type { RunNumbers, RunWeekBody } from '../../shared/run';
import { addWeeks, dateKey, weekOf } from '../../shared/meals';
import type { HrBand } from './fit';
import type { Run } from './garmin-runs';
import { BAND_LOW_PCT, HR_CAP_PCT, TEST_WINDOW_S, TREND_DAYS, TREND_RUNS } from './limits';

const DAY = 86_400_000;
const WEEKS = 12;
const START_DAYS = 56;
const DEFAULT_DAYS = [1, 3, 5];

const weekdayOf = (ms: number): number => (new Date(ms).getDay() + 6) % 7;
const round1 = (x: number): number => Math.round(x * 10) / 10;

/** The highest heart rate seen, else the entered max; null when nothing is known. */
export const maxHrOf = (seen: number | null, runs: Run[], profile: Pick<Profile, 'hrMaxBpm' | 'maxHrBpm'>): number | null => {
  const seenAll = [seen, ...runs.map((r) => r.maxHr)].filter((x): x is number => x !== null && Number.isFinite(x));
  if (seenAll.length > 0) return Math.max(...seenAll);
  return profile.hrMaxBpm ?? profile.maxHrBpm ?? null;
};

export const bandFor = (maxHr: number | null): HrBand | null =>
  maxHr === null ? null : { fromBpm: Math.round(maxHr * BAND_LOW_PCT), toBpm: Math.round(maxHr * HR_CAP_PCT) };
export const capFor = (maxHr: number | null): number | null => (maxHr === null ? null : Math.round(maxHr * HR_CAP_PCT));

/** Mean easy pace of the last runs within the days before `atMs`, weighted by easy seconds. */
export const easyPaceAt = (runs: Run[], atMs: number): number | null => {
  const last = runs
    .filter((r) => r.easyPace !== null && r.startMs <= atMs && r.startMs > atMs - TREND_DAYS * DAY)
    .sort((a, b) => b.startMs - a.startMs)
    .slice(0, TREND_RUNS);
  const seconds = last.reduce((a, r) => a + r.easyPace!.seconds, 0);
  return seconds > 0 ? last.reduce((a, r) => a + r.easyPace!.sPerKm * r.easyPace!.seconds, 0) / seconds : null;
};

const longestKm = (runs: Run[], fromMs: number, toMs: number): number | null => {
  const m = runs.filter((r) => r.startMs >= fromMs && r.startMs <= toMs && r.distanceM !== null).map((r) => r.distanceM!);
  return m.length > 0 ? Math.max(...m) / 1000 : null;
};

export const runNumbers = (runs: Run[], weeks: RunWeekBody[], nowMs: number): RunNumbers => {
  const current = weekOf(nowMs);
  const keys = Array.from({ length: WEEKS }, (_, i) => addWeeks(current, i - (WEEKS - 1)));
  const records = new Map(weeks.map((w) => [w.week, w]));
  const trend = Array.from({ length: WEEKS }, (_, i) => easyPaceAt(runs, nowMs - (WEEKS - 1 - i) * 7 * DAY));
  const tests: RunNumbers['tests'] = [];
  for (const w of keys) {
    for (const p of records.get(w)?.runs ?? []) {
      if (p.kind !== 'test') continue;
      const onDay = runs.filter((r) => dateKey(new Date(r.startMs)) === p.date);
      // The run the week record names, else the best one that lasted a full test window.
      const hit = p.done !== null ? onDay.find((r) => r.id === p.done && r.best30M !== null)
        : onDay.filter((r) => r.best30M !== null && r.durationS >= TEST_WINDOW_S).sort((a, b) => b.best30M! - a.best30M!)[0];
      if (hit) tests.push({ date: p.date, distanceM: hit.best30M! });
    }
  }
  return {
    easyPace: { now: easyPaceAt(runs, nowMs), weeks4: easyPaceAt(runs, nowMs - 28 * DAY), weeks12: easyPaceAt(runs, nowMs - 84 * DAY), trend },
    weeks: keys.map((week) => {
      const inWeek = runs.filter((r) => weekOf(r.startMs) === week);
      const rec = records.get(week);
      return {
        week,
        km: round1(inWeek.reduce((a, r) => a + (r.distanceM ?? 0), 0) / 1000),
        minutes: Math.round(inWeek.reduce((a, r) => a + r.durationS, 0) / 60),
        plannedMinutes: rec ? rec.runs.reduce((a, r) => a + r.minutes, 0) : null,
      };
    }),
    longest: { blockKm: longestKm(runs, nowMs - 28 * DAY, nowMs), lastBlockKm: longestKm(runs, nowMs - 56 * DAY, nowMs - 28 * DAY - 1) },
    tests,
  };
};

/** Where the person stands over the last 56 days. */
export const startPoint = (runs: Run[], nowMs: number): { runsPerWeek: number; typicalMinutes: number; longestMinutes: number; easyPace: number | null } => {
  const recent = runs.filter((r) => r.startMs > nowMs - START_DAYS * DAY && r.startMs <= nowMs);
  const minutes = recent.map((r) => r.durationS / 60).sort((a, b) => a - b);
  const mid = Math.floor(minutes.length / 2);
  const typical = minutes.length === 0 ? 0 : minutes.length % 2 ? minutes[mid]! : (minutes[mid - 1]! + minutes[mid]!) / 2;
  return {
    runsPerWeek: round1(recent.length / (START_DAYS / 7)),
    typicalMinutes: Math.round(typical),
    longestMinutes: minutes.length === 0 ? 0 : Math.round(minutes[minutes.length - 1]!),
    easyPace: easyPaceAt(runs, nowMs),
  };
};

/** Weekdays (Monday 0) with at least two runs in 56 days, else Tuesday, Thursday, Saturday. */
export const suggestedDays = (runs: Run[], nowMs: number): number[] => {
  const count = new Array<number>(7).fill(0);
  for (const r of runs) if (r.startMs > nowMs - START_DAYS * DAY && r.startMs <= nowMs) count[weekdayOf(r.startMs)]!++;
  const days = count.flatMap((c, d) => (c >= 2 ? [d] : []));
  return days.length > 0 ? days : DEFAULT_DAYS;
};

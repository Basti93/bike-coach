import { dateKey } from '../../shared/day-rating';
import type { SportKey } from '../../shared/personal';
import type { LoggedWorkout } from '../../shared/records';
import type { RunWeekBody } from '../../shared/run';
import type { StatsDay } from '../../shared/stats';
import { addDays } from '../../shared/week-plan';

/**
 * The sports with activity in the last `days` days: finished workouts, done runs, and the coach's day summaries
 * (which also know the bike rides). The goal card shows these first.
 */
export function usedSports(workouts: readonly LoggedWorkout[], runWeeks: readonly RunWeekBody[], statsDays: readonly StatsDay[], todayKey: string, days: number): Set<SportKey> {
  const from = addDays(todayKey, -days);
  const out = new Set<SportKey>();
  for (const w of workouts) if (w.endMs !== null && dateKey(w.startMs) >= from) out.add('gym');
  for (const wk of runWeeks) for (const r of wk.runs) if (r.done !== null && r.date >= from) out.add('run');
  for (const d of statsDays) {
    if (d.date < from) continue;
    if (d.minutes.strength > 0) out.add('gym');
    if (d.minutes.run > 0) out.add('run');
    if (d.minutes.bike > 0) out.add('bike');
  }
  return out;
}

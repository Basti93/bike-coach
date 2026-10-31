import type { RideSummary } from './metrics';
import { METRES_PER_MINUTE, weekOf, weekStartMs } from './together';

const WEEKS = 12;
export type RideStats = {
  weeks: { startMs: number; minutes: number }[];
  rides: number; minutes: number; metres: number;
  longestMinutes: number; bestMinuteW: number | null;
};

/** Ein Rückblick mit wenigen Zahlen, nur gegen sich selbst. Fahrten mit vielen Messfehlern zählen nicht für Bestwerte. */
export const rideStats = (summaries: RideSummary[], nowMs: number): RideStats => {
  const now = weekOf(nowMs);
  const minutes = Math.round(summaries.reduce((a, r) => a + r.durationS, 0) / 60);
  const clean = summaries.filter((r) => !r.suspectData).flatMap((r) => (r.bestMinutePowerW === null ? [] : [r.bestMinutePowerW]));
  return {
    weeks: Array.from({ length: WEEKS }, (_, i) => {
      const week = now - (WEEKS - 1 - i);
      return { startMs: weekStartMs(week), minutes: Math.round(summaries.filter((r) => weekOf(r.startedAtMs) === week).reduce((a, r) => a + r.durationS, 0) / 60) };
    }),
    rides: summaries.length, minutes, metres: minutes * METRES_PER_MINUTE,
    longestMinutes: Math.round(Math.max(0, ...summaries.map((r) => r.durationS)) / 60),
    bestMinuteW: clean.length ? Math.max(...clean) : null,
  };
};

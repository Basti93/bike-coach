import type { RideMeta } from '../service/recorder';
import type { Sample } from '../shared/sample';

export type RideSummary = {
  rideId: string; startedAtMs: number; status: 'finished' | 'aborted'; sessionId: string; ftpW: number; durationS: number;
  avgPowerW: number | null; normalizedPowerW: number | null; intensityFactor: number | null; tss: number;
  avgHrBpm: number | null; maxHrBpm: number | null; bestMinutePowerW: number | null; completedFraction: number;
};

const DAY_MS = 86_400_000;
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x: number | null): number | null => (x === null ? null : Math.round(x));

const rollingMeans = (xs: number[], size: number): number[] => {
  if (xs.length < size) return xs.length ? [mean(xs)!] : [];
  let sum = xs.slice(0, size).reduce((a, b) => a + b, 0);
  const out = [sum / size];
  for (let i = size; i < xs.length; i++) {
    sum += xs[i] - xs[i - size];
    out.push(sum / size);
  }
  return out;
};

export const summarizeRide = (input: { meta: RideMeta; samples: Sample[]; ftpW: number; plannedS: number }): RideSummary => {
  const { meta, samples, ftpW, plannedS } = input;
  const powers = samples.map((s) => s.powerW).filter((p): p is number => p !== null);
  const hrs = samples.map((s) => s.hrBpm).filter((h): h is number => h !== null);
  const durationS = samples.at(-1)?.rideElapsedS ?? 0;
  const np = powers.length ? mean(rollingMeans(powers, 30).map((p) => p ** 4))! ** 0.25 : null;
  const intensityFactor = np === null ? null : np / ftpW;
  const hours = powers.length / 3600;
  return {
    rideId: meta.rideId, startedAtMs: meta.startedAtMs, status: meta.status === 'finished' ? 'finished' : 'aborted',
    sessionId: meta.sessionId, ftpW, durationS,
    avgPowerW: round(mean(powers)), normalizedPowerW: round(np),
    intensityFactor: intensityFactor === null ? null : Math.round(intensityFactor * 100) / 100,
    tss: intensityFactor === null ? 0 : hours * intensityFactor ** 2 * 100,
    avgHrBpm: round(mean(hrs)), maxHrBpm: hrs.length ? Math.max(...hrs) : null,
    bestMinutePowerW: powers.length ? Math.round(Math.max(...rollingMeans(powers, 60))) : null,
    completedFraction: plannedS > 0 ? Math.min(1, durationS / plannedS) : 0,
  };
};

export const loadModel = (summaries: RideSummary[], nowMs: number) => {
  const sorted = [...summaries].sort((a, b) => a.startedAtMs - b.startedAtMs);
  const within = (days: number) => sorted.filter((s) => nowMs - s.startedAtMs < days * DAY_MS);
  const sum = (rides: RideSummary[]) => rides.reduce((a, r) => a + r.tss, 0);
  let fitness = 0;
  let fatigue = 0;
  if (sorted.length) {
    const firstDay = Math.floor(sorted[0].startedAtMs / DAY_MS);
    const lastDay = Math.floor(nowMs / DAY_MS);
    for (let day = firstDay; day <= lastDay; day++) {
      const tss = sum(sorted.filter((s) => Math.floor(s.startedAtMs / DAY_MS) === day));
      fitness += (tss - fitness) / 42;
      fatigue += (tss - fatigue) / 7;
    }
  }
  const last = sorted.at(-1);
  return {
    fitness, fatigue, form: fitness - fatigue,
    last7dTss: sum(within(7)), last28dTss: sum(within(28)), ridesLast28d: within(28).length,
    daysSinceLastRide: last ? Math.floor((nowMs - last.startedAtMs) / DAY_MS) : null,
  };
};

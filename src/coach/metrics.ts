import type { RideMeta } from '../service/recorder';
import type { Sample } from '../shared/sample';
import { stepFtpFraction, type Session, type Step } from '../shared/session';
import { stepTargetZone, zoneOf } from '../shared/hr-zones';

export type RideSummary = {
  rideId: string; startedAtMs: number; status: 'finished' | 'aborted'; sessionId: string; ftpW: number; durationS: number;
  avgPowerW: number | null; normalizedPowerW: number | null; intensityFactor: number | null; tss: number;
  avgHrBpm: number | null; maxHrBpm: number | null; bestMinutePowerW: number | null; completedFraction: number;
  sessionName?: string; suspectData?: boolean; intervalsPlanned?: number; intervalsDone?: number;
  hrZoneMinutes?: number[]; hrTargetPct?: number; hrDriftPct?: number; hrRecoveryBpm?: number;
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

const MAX_POWER_W = 2500;
const MIN_HR = 25;
const MAX_HR = 240;
const SPIKE_MIN_W = 400;
const SPIKE_FACTOR = 2.5;
const SPIKE_WINDOW = 5;
const SPIKE_MAX_S = 2;
const SUSPECT_SHARE = 0.05;

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** Entfernt nur für die Auswertung unmögliche Werte und kurze Spitzen. Echte Nullen und Sprints bleiben, die Rohdaten auf der Platte auch. */
export const cleanSamples = (samples: Sample[]): { samples: Sample[]; removed: number } => {
  let removed = 0;
  const ranged = samples.map((s) => {
    const badPower = s.powerW !== null && (s.powerW < 0 || s.powerW > MAX_POWER_W);
    const badHr = s.hrBpm !== null && (s.hrBpm < MIN_HR || s.hrBpm > MAX_HR);
    if (badPower || badHr) removed++;
    return { ...s, powerW: badPower ? null : s.powerW, hrBpm: badHr ? null : s.hrBpm };
  });
  const isSpike = (i: number): boolean => {
    const p = ranged[i].powerW;
    if (p === null || p < SPIKE_MIN_W) return false;
    const around = ranged.slice(Math.max(0, i - SPIKE_WINDOW), i + SPIKE_WINDOW + 1).flatMap((s, j) => (s.powerW === null || s === ranged[i] ? [] : [s.powerW]));
    return p > SPIKE_FACTOR * Math.max(median(around), 1);
  };
  const out = ranged.map((s) => ({ ...s }));
  for (let i = 0; i < ranged.length; ) {
    let end = i;
    while (end < ranged.length && isSpike(end)) end++;
    if (end > i && end - i <= SPIKE_MAX_S) { for (let j = i; j < end; j++) out[j].powerW = null; removed += end - i; }
    i = Math.max(end, i + 1);
  }
  return { samples: out, removed };
};

const HARD_STEP = 0.85;
const ERG_LAG_S = 15;
const DONE_SHARE = 0.9;
/** Soll und Ist je hartem Abschnitt: Die Gesamtbelastung verdeckt sonst fehlende Wiederholungen. */
const countIntervals = (session: Session, samples: Sample[], ftpW: number): { intervalsPlanned: number; intervalsDone: number } => {
  let start = 0, intervalsPlanned = 0, intervalsDone = 0;
  for (const step of session.steps) {
    const end = start + step.durationS;
    if (step.kind === 'erg' && step.ftpFraction >= HARD_STEP) {
      intervalsPlanned++;
      const inStep = samples.filter((x) => x.rideElapsedS > start + ERG_LAG_S && x.rideElapsedS <= end && x.powerW !== null);
      const avg = mean(inStep.map((x) => x.powerW as number));
      if (avg !== null && inStep.length >= (step.durationS - ERG_LAG_S) * DONE_SHARE && avg >= step.ftpFraction * ftpW * DONE_SHARE) intervalsDone++;
    }
    start = end;
  }
  return { intervalsPlanned, intervalsDone };
};

const DRIFT_MIN_S = 600;
const DRIFT_SKIP_S = 120;
const HARD_FRACTION = 0.8;
const RECOVERY_S = 60;

/** Puls gegen Abschnitte: siehe docs/hr-zones.md. Zonen nur mit bekanntem Maximalpuls. */
const heartRateFacts = (samples: Sample[], session: Session | undefined, hrMaxBpm: number | undefined): Partial<RideSummary> => {
  const out: Partial<RideSummary> = {};
  const steps = session?.steps ?? [];
  const windows = steps.reduce<{ step: Step; from: number; to: number }[]>((all, step) => {
    const from = all.at(-1)?.to ?? 0;
    return [...all, { step, from, to: from + step.durationS }];
  }, []);
  const known = samples.filter((s): s is Sample & { hrBpm: number } => s.hrBpm !== null);
  if (hrMaxBpm && known.length) {
    const seconds = [0, 0, 0, 0, 0];
    let inTarget = 0, withTarget = 0;
    for (const s of known) {
      const zone = zoneOf(s.hrBpm, hrMaxBpm);
      if (zone > 0) seconds[zone - 1] += 1;
      const w = windows.find((x) => s.rideElapsedS > x.from && s.rideElapsedS <= x.to);
      if (w) { withTarget += 1; if (zone <= stepTargetZone(w.step)) inTarget += 1; }
    }
    out.hrZoneMinutes = seconds.map((x) => Math.round(x / 60));
    if (withTarget) out.hrTargetPct = Math.round((inTarget / withTarget) * 100);
  }
  const longest = windows.filter((w) => w.step.kind === 'erg' && w.step.durationS >= DRIFT_MIN_S).sort((a, b) => b.step.durationS - a.step.durationS)[0];
  if (longest) {
    const from = longest.from + DRIFT_SKIP_S;
    const middle = (from + longest.to) / 2;
    const first = mean(known.filter((s) => s.rideElapsedS > from && s.rideElapsedS <= middle).map((s) => s.hrBpm));
    const second = mean(known.filter((s) => s.rideElapsedS > middle && s.rideElapsedS <= longest.to).map((s) => s.hrBpm));
    if (first && second) out.hrDriftPct = Math.round(((second - first) / first) * 100);
  }
  const hrAt = (t: number) => known.find((s) => s.rideElapsedS === t)?.hrBpm ?? null;
  const drops = windows.flatMap((w, i) => {
    const next = windows[i + 1];
    if (!next || stepFtpFraction(w.step) < HARD_FRACTION || stepFtpFraction(next.step) >= HARD_FRACTION || next.step.durationS < RECOVERY_S) return [];
    const top = hrAt(w.to);
    const later = hrAt(w.to + RECOVERY_S);
    return top === null || later === null ? [] : [top - later];
  });
  if (drops.length) out.hrRecoveryBpm = Math.round(Math.max(...drops));
  return out;
};

export const summarizeRide = (input: { meta: RideMeta; samples: Sample[]; ftpW: number; plannedS: number; session?: Session; hrMaxBpm?: number }): RideSummary => {
  const { meta, ftpW, plannedS, session } = input;
  const { samples, removed } = cleanSamples(input.samples);
  const powers = samples.map((s) => s.powerW).filter((p): p is number => p !== null);
  const hrs = samples.map((s) => s.hrBpm).filter((h): h is number => h !== null);
  const durationS = samples.at(-1)?.rideElapsedS ?? 0;
  const np = powers.length ? mean(rollingMeans(powers, 30).map((p) => p ** 4))! ** 0.25 : null;
  const intensityFactor = np === null ? null : np / ftpW;
  const hours = powers.length / 3600;
  return {
    ...(session ? { sessionName: session.name } : {}),
    rideId: meta.rideId, startedAtMs: meta.startedAtMs, status: meta.status === 'finished' ? 'finished' : 'aborted',
    sessionId: meta.sessionId, ftpW, durationS,
    avgPowerW: round(mean(powers)), normalizedPowerW: round(np),
    intensityFactor: intensityFactor === null ? null : Math.round(intensityFactor * 100) / 100,
    tss: intensityFactor === null ? 0 : hours * intensityFactor ** 2 * 100,
    avgHrBpm: round(mean(hrs)), maxHrBpm: hrs.length ? Math.max(...hrs) : null,
    bestMinutePowerW: powers.length ? Math.round(Math.max(...rollingMeans(powers, 60))) : null,
    completedFraction: plannedS > 0 ? Math.min(1, durationS / plannedS) : 0,
    ...(removed > samples.length * SUSPECT_SHARE ? { suspectData: true } : {}),
    ...(session ? countIntervals(session, samples, ftpW) : {}),
    ...heartRateFacts(samples, session, input.hrMaxBpm),
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

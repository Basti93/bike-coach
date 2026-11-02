import type { GarminActivity, GarminDay, GarminHealth, GarminProgress, HealthPoint, HealthYear } from '../shared/garmin';

const DAY_MS = 86_400_000;
const MIN_RATED_RIDES = 10;
type Input = { days: GarminDay[]; activities: GarminActivity[]; progress: GarminProgress; rated: { startedAtMs: number; rating: 'easy' | 'right' | 'hard' }[] };

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const mean = (xs: (number | null)[]): number | null => {
  const known = xs.filter((x): x is number => x !== null);
  return known.length ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10 : null;
};
const stepFor = (rangeDays: number | null): number => (rangeDays === null ? 30 : rangeDays <= 90 ? 1 : 7);

const points = ({ days, activities }: Input, rangeDays: number | null, nowMs: number): HealthPoint[] => {
  const dayMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);
  const today = dayMs(iso(nowMs));
  const oldest = Math.min(...days.map((d) => dayMs(d.date)), ...activities.map((a) => dayMs(iso(a.startMs))));
  if (rangeDays === null && !Number.isFinite(oldest)) return [];
  const span = rangeDays ?? Math.round((today - oldest) / DAY_MS) + 1;
  const step = stepFor(rangeDays);
  const out: HealthPoint[] = [];
  for (let endDaysBack = 0; endDaysBack < span; endDaysBack += step) {
    const end = today - endDaysBack * DAY_MS;
    const start = end - (step - 1) * DAY_MS;
    const inBucket = days.filter((d) => dayMs(d.date) >= start && dayMs(d.date) <= end);
    const load = activities.filter((a) => a.startMs >= start && a.startMs < end + DAY_MS && a.trainingLoad !== null);
    out.unshift({
      date: iso(end),
      restingHrBpm: mean(inBucket.map((d) => d.restingHrBpm)),
      vo2max: mean(inBucket.map((d) => d.vo2max)),
      sleepS: mean(inBucket.map((d) => d.sleepS)),
      hrvMs: mean(inBucket.map((d) => d.hrvMs)),
      stressAvg: mean(inBucket.map((d) => d.stressAvg)),
      bodyBatteryMax: mean(inBucket.map((d) => d.bodyBatteryMax)),
      load: load.length ? Math.round(load.reduce((sum, a) => sum + a.trainingLoad!, 0)) : null,
    });
  }
  return out;
};

const years = (activities: GarminActivity[]): HealthYear[] => {
  const rows = new Map<string, HealthYear>();
  for (const a of activities) {
    const jahr = iso(a.startMs).slice(0, 4);
    const row = rows.get(`${jahr}|${a.sport}`) ?? { jahr, sport: a.sport, anzahl: 0, stunden: 0 };
    row.anzahl += 1;
    row.stunden += a.durationS / 3600;
    rows.set(`${jahr}|${a.sport}`, row);
  }
  return [...rows.values()].map((r) => ({ ...r, stunden: Math.round(r.stunden * 10) / 10 }))
    .sort((a, b) => b.jahr.localeCompare(a.jahr) || b.stunden - a.stunden);
};

/** Only what the combined week view needs, for the last 13 weeks (12 weeks plus the days up to Monday). */
const recentActivities = (activities: GarminActivity[], nowMs: number): NonNullable<GarminHealth['activities']> =>
  activities.filter((a) => a.startMs >= nowMs - 13 * 7 * DAY_MS)
    .map((a) => ({ id: a.id, startMs: a.startMs, durationS: a.durationS, sport: a.sport, name: a.name, fromBikeCoach: a.fromBikeCoach }));

const pulseBeforeRides =({ days, rated }: Input): GarminHealth['pulseBeforeRides'] => {
  const pulse = new Map(days.map((d) => [d.date, d.restingHrBpm]));
  const known = rated.flatMap((r) => { const v = pulse.get(iso(r.startedAtMs)); return v === null || v === undefined ? [] : [{ v, hard: r.rating === 'hard' }]; });
  const hard = mean(known.filter((k) => k.hard).map((k) => k.v));
  const other = mean(known.filter((k) => !k.hard).map((k) => k.v));
  return known.length >= MIN_RATED_RIDES && hard !== null && other !== null ? { hard, other, rides: known.length } : null;
};

/** Condenses for the health page: days up to 90 days, then weeks, months for the whole history. */
export const healthData = (input: Input, rangeDays: number | null, nowMs: number): GarminHealth => ({
  points: points(input, rangeDays, nowMs), years: years(input.activities), progress: input.progress, pulseBeforeRides: pulseBeforeRides(input),
  activities: recentActivities(input.activities, nowMs),
});

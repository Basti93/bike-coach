import { healthData } from '../../src/coach/garmin-health';
import type { GarminActivity, GarminDay } from '../../src/shared/garmin';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-01T12:00:00Z');
const date = (back: number) => new Date(NOW - back * DAY).toISOString().slice(0, 10);
const day = (back: number, over: Partial<GarminDay> = {}): GarminDay => ({
  date: date(back), restingHrBpm: 60, hrvMs: null, sleepS: null, deepS: null, remS: null, sleepScore: null, bodyBatteryMax: null,
  stressAvg: null, vo2max: null, steps: null, readinessScore: null, acuteLoad: null, recoveryHours: null, ...over,
});
const activity = (back: number, over: Partial<GarminActivity> = {}): GarminActivity => ({
  id: String(back), startMs: NOW - back * DAY, sport: 'running', name: null, durationS: 3600, distanceM: null, avgHr: null, maxHr: null,
  avgPowerW: null, normPowerW: null, trainingLoad: 40, aerobicEffect: null, fromBikeCoach: false, ...over,
});
const progress = { activities: 0, activitiesComplete: true, daysDone: 0, daysTotal: 0, filesDone: 0, filesTotal: 0 };
const make = (days: GarminDay[], activities: GarminActivity[], rangeDays: number | null, rated: { startedAtMs: number; rating: 'easy' | 'right' | 'hard' }[] = []) =>
  healthData({ days, activities, progress, rated }, rangeDays, NOW);

test('short ranges show one point per day, with gaps as nulls', () => {
  const h = make([day(0, { restingHrBpm: 61 }), day(2, { restingHrBpm: 63 })], [], 7);
  expect(h.points).toHaveLength(7);
  expect(h.points.at(-1)).toMatchObject({ date: date(0), restingHrBpm: 61 });
  expect(h.points.at(-2)?.restingHrBpm).toBeNull();
});
test('load sums the activities of each point', () => {
  const h = make([], [activity(1), activity(1, { id: 'b', trainingLoad: 10 })], 7);
  expect(h.points.at(-2)?.load).toBe(50);
  expect(h.points.at(-1)?.load).toBeNull();
});
test('a year is grouped by week with means and sums', () => {
  const days = Array.from({ length: 14 }, (_, i) => day(i, { restingHrBpm: i < 7 ? 60 : 64 }));
  const h = make(days, [activity(1), activity(2)], 365);
  expect(h.points.length).toBeLessThanOrEqual(53);
  expect(h.points.at(-1)).toMatchObject({ restingHrBpm: 60, load: 80 });
});
test('all years stay small and start at the oldest data', () => {
  const h = make([day(0)], [activity(2700)], null);
  expect(h.points.length).toBeLessThanOrEqual(100);
  expect(h.points[0].load).toBe(40);
});
test('no data at all gives no points', () => {
  expect(make([], [], null).points).toEqual([]);
});
test('the table sums each sport per year, newest first', () => {
  const h = make([], [activity(1), activity(2), activity(1, { id: 'c', sport: 'cycling', durationS: 7200 }), activity(800)], null);
  expect(h.years[0].jahr).toBe('2026');
  expect(h.years.find((y) => y.jahr === '2026' && y.sport === 'running')).toMatchObject({ anzahl: 2, stunden: 2 });
  expect(h.years.at(-1)?.jahr).toBe('2024');
});
test('the pulse before rides is compared only with at least 10 rated rides', () => {
  const days = Array.from({ length: 30 }, (_, i) => day(i, { restingHrBpm: i < 5 ? 70 : 60 }));
  const rated = (n: number) => Array.from({ length: n }, (_, i) => ({ startedAtMs: NOW - (i * 2) * DAY, rating: i < 3 ? 'hard' as const : 'right' as const }));
  expect(make(days, [], 90, rated(9)).pulseBeforeRides).toBeNull();
  expect(make(days, [], 90, rated(12)).pulseBeforeRides).toEqual({ hard: 70, other: 60, rides: 12 });
});
test('the last thirteen weeks of activities come along for the combined week view', () => {
  const h = make([], [activity(1, { id: 'near', sport: 'hiking', name: 'Runde' }), activity(120, { id: 'far' })], 7);
  expect(h.activities).toEqual([{ id: 'near', startMs: NOW - DAY, durationS: 3600, sport: 'hiking', name: 'Runde', fromBikeCoach: false }]);
});

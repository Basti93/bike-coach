import { loadModel, summarizeRide, type RideSummary } from '../../src/coach/metrics';
import type { RideMeta } from '../../src/service/recorder';
import type { Sample } from '../../src/shared/sample';

const meta: RideMeta = { rideId: 'r', profileId: 'p', sessionId: 's', startedAtMs: 0, status: 'finished' };
const samples = (powers: (number | null)[]): Sample[] => powers.map((p, i) => ({ seq: i, wallClockMs: i * 1000, rideElapsedS: i + 1, powerW: p, cadenceRpm: 90, speedKph: 30, hrBpm: p === null ? null : 130 + (i % 3), targetW: p, gradePct: null, gear: null }));
const summary = (powers: (number | null)[], plannedS = powers.length, m = meta) => summarizeRide({ meta: m, samples: samples(powers), ftpW: 200, plannedS });
const DAY = 86_400_000;
const ride = (dayMs: number, tss = 60): RideSummary => ({ ...summary([100]), startedAtMs: dayMs, tss });

test('constant 200 W at FTP 200 for 1 h is about 100 TSS', () => {
  const s = summary(Array(3600).fill(200));
  expect(s.intensityFactor).toBeCloseTo(1, 2);
  expect(s.tss).toBeCloseTo(100, 0);
});
test('null power seconds do not count as zero power', () => {
  expect(summary([200, null, 200, null]).avgPowerW).toBe(200);
});
test('ride without any power has null metrics and 0 TSS', () => {
  const s = summary([null, null]);
  expect([s.avgPowerW, s.normalizedPowerW, s.intensityFactor, s.bestMinutePowerW]).toEqual([null, null, null, null]);
  expect(s.tss).toBe(0);
});
test('best minute power finds the strongest 60 s', () => {
  expect(summary([...Array(120).fill(100), ...Array(60).fill(300), ...Array(120).fill(100)]).bestMinutePowerW).toBe(300);
});
test('aborted ride at half has completedFraction 0.5', () => {
  const s = summary(Array(50).fill(100), 100, { ...meta, status: 'aborted' });
  expect(s.completedFraction).toBe(0.5);
  expect(s.status).toBe('aborted');
});
test('fitness decays over weeks without riding', () => {
  const rides = Array.from({ length: 20 }, (_, i) => ride(i * DAY));
  const soon = loadModel(rides, 20 * DAY);
  const later = loadModel(rides, 60 * DAY);
  expect(later.fitness).toBeLessThan(soon.fitness);
  expect(later.daysSinceLastRide).toBe(41);
  expect(later.ridesLast28d).toBe(0);
});
test('hard block produces fatigue above fitness, so form is negative', () => {
  expect(loadModel(Array.from({ length: 7 }, (_, i) => ride(i * DAY, 120)), 7 * DAY).form).toBeLessThan(0);
});
test('no rides gives zero load and null daysSinceLastRide', () => {
  expect(loadModel([], DAY)).toEqual({ fitness: 0, fatigue: 0, form: 0, last7dTss: 0, last28dTss: 0, ridesLast28d: 0, daysSinceLastRide: null });
});

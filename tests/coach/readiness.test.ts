import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Coach } from '../../src/coach/coach';
import { assessReadiness, externalLoad, garminPromptData, historySummary } from '../../src/coach/readiness';
import { ruleBasedSession } from '../../src/coach/rules';
import type { RideSummary } from '../../src/coach/metrics';
import type { GarminActivity, GarminDay } from '../../src/shared/garmin';

const DAY = 86_400_000;
const TODAY = '2026-11-01';
const NOW = Date.parse(`${TODAY}T12:00:00Z`);
const dateBack = (n: number) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
const day = (back: number, over: Partial<GarminDay> = {}): GarminDay => ({
  date: dateBack(back), restingHrBpm: 60, hrvMs: null, sleepS: null, deepS: null, remS: null, sleepScore: null, bodyBatteryMax: null,
  stressAvg: null, vo2max: null, steps: null, readinessScore: null, acuteLoad: null, recoveryHours: null, ...over,
});
const days = (over: Record<number, Partial<GarminDay>> = {}, n = 28) => Array.from({ length: n }, (_, i) => day(n - 1 - i, over[n - 1 - i] ?? {}));
const activity = (back: number, over: Partial<GarminActivity> = {}): GarminActivity => ({
  id: String(back), startMs: NOW - back * DAY, sport: 'running', name: 'Lauf', durationS: 1800, distanceM: 5000, avgHr: 140, maxHr: 160,
  avgPowerW: null, normPowerW: null, trainingLoad: 50, aerobicEffect: 3, fromBikeCoach: false, ...over,
});
const ride = (startedAtMs: number, durationS: number): RideSummary => ({
  rideId: 'r', startedAtMs, status: 'finished', sessionId: 's', ftpW: 200, durationS, avgPowerW: 100, normalizedPowerW: 100, intensityFactor: 0.5, tss: 30,
  avgHrBpm: 120, maxHrBpm: 140, bestMinutePowerW: 150, completedFraction: 1,
});

test('a raised resting pulse on two days in a row asks for caution', () => {
  const r = assessReadiness(days({ 0: { restingHrBpm: 65 }, 1: { restingHrBpm: 66 } }), [], TODAY);
  expect(r.level).toBe('careful');
  expect(r.reasons.join()).toContain('Ruhepuls');
});
test('one raised day is still normal', () => {
  expect(assessReadiness(days({ 0: { restingHrBpm: 70 } }), [], TODAY).level).toBe('normal');
});
test('a short night counts when sleep data exists, years without it never complain', () => {
  const short = assessReadiness(days({ 0: { sleepS: 4.5 * 3600 } }), [], TODAY);
  expect(short.level).toBe('careful');
  expect(short.reasons.join()).toContain('Schlaf');
  const none = assessReadiness(days(), [], TODAY);
  expect(none.level).toBe('normal');
  expect(none.reasons).toEqual([]);
});
test('too few resting pulse values mean unknown, and empty days never throw', () => {
  expect(assessReadiness(days({}, 10), [], TODAY).level).toBe('unknown');
  const empty = days(Object.fromEntries(Array.from({ length: 28 }, (_, i) => [i, { restingHrBpm: null }])));
  expect(assessReadiness(empty, [], TODAY)).toEqual({ level: 'unknown', reasons: [] });
  expect(assessReadiness([], [], TODAY)).toEqual({ level: 'unknown', reasons: [] });
});
test('a heavy load from other sports in the last three days asks for caution', () => {
  const steady = Array.from({ length: 25 }, (_, i) => activity(i + 3, { trainingLoad: 20 }));
  const load = (back: number, trainingLoad: number) => ({ sport: 'running', startMs: NOW - back * DAY, durationS: 3600, trainingLoad });
  const external = [...steady.map((a) => ({ sport: a.sport, startMs: a.startMs, durationS: a.durationS, trainingLoad: 20 })), load(1, 150)];
  const r = assessReadiness(days(), external, TODAY);
  expect(r.level).toBe('careful');
  expect(r.reasons.join()).toContain('Belastung');
  const normal = [...steady.map((a) => ({ sport: a.sport, startMs: a.startMs, durationS: a.durationS, trainingLoad: 20 })), load(1, 20)];
  expect(assessReadiness(days(), normal, TODAY).level).toBe('normal');
});
test('a ride uploaded to Garmin never counts twice, a run that day still does', () => {
  const start = NOW - DAY;
  const load = externalLoad([
    activity(1, { id: 'own', fromBikeCoach: true, sport: 'indoor_cycling' }),
    activity(1, { id: 'dup', sport: 'indoor_cycling', startMs: start + 5 * 60_000, durationS: 3600 }),
    activity(1, { id: 'run', sport: 'running', startMs: start + 5 * 3600_000 }),
  ], [ride(start, 3700)], NOW);
  expect(load.map((a) => a.sport)).toEqual(['running']);
});
test('external load only looks 42 days back', () => {
  expect(externalLoad([activity(100), activity(10)], [], NOW)).toHaveLength(1);
});
test('the history stays short even over many years', () => {
  const many = Array.from({ length: 3000 }, (_, i) => activity(i, { sport: i % 2 ? 'cycling' : 'running', durationS: 3600 }));
  const h = historySummary(many, NOW);
  expect(h.length).toBeLessThan(120);
  expect(JSON.stringify(h).length).toBeLessThan(15_000);
  expect(h.reduce((a, x) => a + x.anzahl, 0)).toBe(3000);
  expect(h.at(-1)?.zeitraum).toBe('2026-11');
  expect(h[0].zeitraum).toHaveLength(4);
});
test('the prompt data has recent days, readiness, other sports and history', () => {
  const data = garminPromptData({ days: days(), activities: [activity(1), activity(800)], body: { birthDate: '1990-01-15', sex: 'male', heightCm: 178, weightKg: 72, ftpW: 183, ftpStale: true, maxHrSeen: 190 } }, [], NOW) as Record<string, any>;
  expect(data.tage).toHaveLength(14);
  expect(data.erholung.level).toBe('normal');
  expect(data.andereSportarten).toHaveLength(1);
  expect(data.verlauf.length).toBeGreaterThan(0);
  expect(data.koerper.gewichtKg).toBe(72);
  expect(data.koerper.garminFtpVeraltet).toBe(true);
});
test('careful means no intervals from the rules', () => {
  const rides = Array.from({ length: 5 }, (_, i) => ride(NOW - (i + 3) * DAY, 3600));
  const ctx = { ftpW: 200, summaries: rides, nowMs: NOW };
  expect(ruleBasedSession(ctx).session.id).toBe('regel-intervalle');
  expect(ruleBasedSession({ ...ctx, careful: true }).session.id).toBe('regel-erholung');
});

const coachWith = (garmin?: () => any) => {
  const prompts: string[] = [];
  const coach = new Coach({
    ridesDir: fs.mkdtempSync(path.join(os.tmpdir(), 'r-')), coachDir: fs.mkdtempSync(path.join(os.tmpdir(), 'c-')), nowMs: () => NOW, garmin,
    ask: async ({ prompt }) => { prompts.push(prompt); throw new Error('egal'); },
  } as ConstructorParameters<typeof Coach>[0]);
  coach.scanRides([{ id: 'p', name: 'A', ftpW: 200 }]);
  return { coach, prompts };
};
test('the coach sees Garmin data when there is some', async () => {
  const { coach, prompts } = coachWith(() => ({ days: days(), activities: [activity(1)], body: null }));
  await coach.refresh('p').catch(() => {});
  expect(prompts[0]).toContain('"garmin"');
  expect(prompts[0]).toContain('Lauf');
  expect(prompts[0]).toContain('Uhr');
});
test('without Garmin data the prompt is unchanged', async () => {
  const plain = coachWith();
  const empty = coachWith(() => null);
  await plain.coach.refresh('p').catch(() => {});
  await empty.coach.refresh('p').catch(() => {});
  expect(empty.prompts[0]).toBe(plain.prompts[0]);
  expect(plain.prompts[0]).not.toContain('garmin');
});
test('a failing Garmin read never stops the coach', async () => {
  const { coach, prompts } = coachWith(() => { throw new Error('kaputt'); });
  await coach.refresh('p').catch(() => {});
  expect(prompts).toHaveLength(1);
});

test('a manual FTP becomes the valid one and is remembered with its source', () => {
  const { coach } = coachWith();
  coach.setFtp('p', 210);
  const s = coach.state('p');
  expect(s.ftpW).toBe(210);
  expect(s.ftpHistory.at(-1)).toMatchObject({ ftpW: 210, source: 'manual' });
  expect(s.dirty).toBe(true);
  expect(s.next.source).toBe('rules');
});

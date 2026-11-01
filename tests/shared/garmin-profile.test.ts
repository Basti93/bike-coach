import { reviewFields, suggestProfile } from '../../src/shared/garmin-profile';
import type { GarminActivity, GarminBody } from '../../src/shared/garmin';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-01T12:00:00Z');
const body: GarminBody = { birthDate: '1990-01-15', sex: 'male', heightCm: 178, weightKg: 72, ftpW: 183, ftpStale: false, maxHrSeen: 190 };
const run = (back: number, over: Partial<GarminActivity> = {}): GarminActivity => ({
  id: String(back), startMs: NOW - back * DAY, sport: 'running', name: null, durationS: 1800, distanceM: 6000, avgHr: 150, maxHr: 170,
  avgPowerW: null, normPowerW: null, trainingLoad: 50, aerobicEffect: 3, fromBikeCoach: false, ...over,
});

test('takes the body values as they are', () => {
  expect(suggestProfile(body, [], NOW)).toMatchObject({ birthDate: '1990-01-15', sex: 'male', heightCm: 178, weightKg: 72, maxHrBpm: 190 });
});
test('a current FTP comes from Garmin, without an estimate limit', () => {
  expect(suggestProfile(body, [], NOW).ftp).toEqual({ startW: 183, source: 'garmin' });
});
test('a stale or missing FTP falls back to the careful estimate with a limit', () => {
  for (const b of [{ ...body, ftpStale: true }, { ...body, ftpW: null }]) {
    const f = suggestProfile(b, [], NOW).ftp;
    expect(f?.source).toBe('estimate');
    expect(f?.capW).toBeGreaterThan(0);
    expect(f?.startW).toBeLessThanOrEqual(f!.capW!);
  }
});
test('no estimate without age, height or weight', () => {
  expect(suggestProfile({ ...body, ftpW: null, heightCm: null }, [], NOW).ftp).toBeNull();
});
test('the best 5 km pace only uses real recent runs of at least 5 km', () => {
  const s = suggestProfile(body, [
    run(10, { distanceM: 5000, durationS: 1500 }),
    run(20, { distanceM: 10000, durationS: 2800 }),
    run(30, { distanceM: 3000, durationS: 600 }),
    run(200, { distanceM: 5000, durationS: 1000 }),
    run(5, { sport: 'cycling', distanceM: 50000, durationS: 3600 }),
  ], NOW);
  expect(s.run5kMin).toBeCloseTo(23.33, 1);
  expect(suggestProfile(body, [], NOW).run5kMin).toBeNull();
});
test('activity level grows with the hours of the last four weeks', () => {
  const level = (n: number) => suggestProfile(body, Array.from({ length: n }, (_, i) => run(i + 1, { durationS: 3600 })), NOW).activity;
  expect(level(0)).toBe(1);
  expect(level(8)).toBeGreaterThan(level(1)!);
  expect(level(28)).toBeGreaterThan(level(8)!);
  expect(level(28)).toBeLessThanOrEqual(7);
});
test('implausible pulse values are not suggested', () => {
  expect(suggestProfile({ ...body, maxHrSeen: 60 }, [], NOW).maxHrBpm).toBeNull();
  expect(suggestProfile({ ...body, maxHrSeen: 260 }, [], NOW).maxHrBpm).toBeNull();
});
test('missing values are listed', () => {
  const s = suggestProfile({ birthDate: null, sex: 'unknown', heightCm: null, weightKg: 72, ftpW: null, ftpStale: false, maxHrSeen: null }, [], NOW);
  expect(s.missing).toEqual(['Geburtsdatum', 'Geschlecht', 'Größe', 'FTP', 'Maximalpuls']);
});
test('review offers empty fields as selected and differences as not selected', () => {
  const fields = reviewFields({ id: 'p', name: 'S', ftpW: 150, weightKg: 70, heightCm: 178 }, 150, suggestProfile(body, [], NOW));
  const by = Object.fromEntries(fields.map((f) => [f.key, f]));
  expect(by.birthDate).toMatchObject({ selected: true, own: null, garmin: '1990-01-15' });
  expect(by.weightKg).toMatchObject({ selected: false, own: '70', garmin: '72' });
  expect(by.heightCm).toBeUndefined();
});
test('FTP and pulse limit are never selected by themselves', () => {
  const fields = reviewFields({ id: 'p', name: 'S', ftpW: 150 }, 150, suggestProfile(body, [], NOW));
  expect(fields.find((f) => f.key === 'ftpW')?.selected).toBe(false);
  expect(fields.find((f) => f.key === 'hrMaxBpm')?.selected).toBe(false);
});
test('the FTP compares with the valid value from the coach', () => {
  expect(reviewFields({ id: 'p', name: 'S', ftpW: 100 }, 183, suggestProfile(body, [], NOW)).find((f) => f.key === 'ftpW')).toBeUndefined();
});

const ride = (back: number, over: Partial<GarminActivity> = {}) => run(back, { sport: 'virtual_ride', durationS: 3200, normPowerW: 136, avgPowerW: 119, ...over });
test('without a current FTP, the best recent ride power is the suggestion', () => {
  const f = suggestProfile({ ...body, ftpStale: true }, [ride(30), ride(60, { normPowerW: 120 })], NOW).ftp;
  expect(f).toEqual({ startW: 129, source: 'rides' });
});
test('short, old or non-cycling efforts do not set the ride FTP', () => {
  const none = [ride(30, { durationS: 600 }), ride(500), run(5, { normPowerW: 300 })];
  expect(suggestProfile({ ...body, ftpStale: true }, none, NOW).ftp?.source).toBe('estimate');
});
test('easy jogs do not pull the estimate down', () => {
  const stale = { ...body, ftpStale: true };
  const alone = suggestProfile(stale, [], NOW).ftp!;
  const jogs = Array.from({ length: 2 }, (_, i) => run(i + 40, { distanceM: 5000, durationS: 1980 }));
  expect(suggestProfile(stale, jogs, NOW).ftp!.startW).toBeGreaterThanOrEqual(alone.startW);
});
test('review names ride power as the origin', () => {
  const s = suggestProfile({ ...body, ftpStale: true }, [ride(30)], NOW);
  expect(reviewFields({ id: 'p', name: 'S', ftpW: 100 }, 100, s).find((f) => f.key === 'ftpW')?.origin).toBe('Deine Fahrten');
});

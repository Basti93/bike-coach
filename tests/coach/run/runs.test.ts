import { manualRuns, mergeRuns } from '../../../src/coach/run/runs';
import type { Run } from '../../../src/coach/run/garmin-runs';
import type { ManualRunBody } from '../../../src/shared/run';
import type { TrackedRecord } from '../../../src/shared/records';

const MIN = 60_000;
const T0 = new Date(2027, 5, 15, 7, 0).getTime();
const band = { fromBpm: 100, toBpm: 130 };
const body = (o: Partial<ManualRunBody> = {}): ManualRunBody => ({ type: 'manual', startMs: T0, durationS: 1800, distanceM: 5000, avgHr: null, runType: 'running', ...o });
const rec = (id: string, b: unknown, deleted = false): TrackedRecord => ({ kind: 'run', id, updatedMs: 1, deleted, body: b });
const garmin = (o: Partial<Run> = {}): Run => ({
  id: 'ga', source: 'garmin', type: 'running', startMs: T0, durationS: 1800, distanceM: 5000, avgHr: 120, maxHr: 150,
  elevationGainM: 10, hasHr: true, easyPace: null, best30M: null, tempC: 12, ...o,
});

test('a manual run overlapping a Garmin run by half counts once and the Garmin one wins', () => {
  const manual = manualRuns([rec('manual-a', body({ startMs: T0 + 10 * MIN }))], null);
  const merged = mergeRuns([garmin()], manual);
  expect(merged).toHaveLength(1);
  expect(merged[0].source).toBe('garmin');
});

test('two minutes clock drift still merges', () => {
  const manual = manualRuns([rec('manual-a', body({ startMs: T0 + 2 * MIN }))], null);
  expect(mergeRuns([garmin()], manual)).toHaveLength(1);
});

test('different run types never merge; a manual run a day apart stays', () => {
  const trail = manualRuns([rec('manual-a', body({ runType: 'trail_running' }))], null);
  expect(mergeRuns([garmin()], trail)).toHaveLength(2);
  const later = manualRuns([rec('manual-b', body({ startMs: T0 + 86_400_000 }))], null);
  expect(mergeRuns([garmin()], later)).toHaveLength(2);
});

test('the merged list is sorted by start', () => {
  const manual = manualRuns([rec('manual-b', body({ startMs: T0 + 86_400_000 })), rec('manual-c', body({ startMs: T0 - 86_400_000 }))], null);
  expect(mergeRuns([garmin()], manual).map((r) => r.startMs)).toEqual([T0 - 86_400_000, T0, T0 + 86_400_000]);
});

test('a manual run without heart rate gets no easy pace', () => {
  const [r] = manualRuns([rec('manual-a', body())], band);
  expect(r).toMatchObject({ id: 'manual-a', source: 'manual', hasHr: false, easyPace: null, tempC: null, elevationGainM: null });
});

test('a manual run with heart rate in band gives one value with its whole duration', () => {
  const [r] = manualRuns([rec('manual-a', body({ avgHr: 120 }))], band);
  expect(r.hasHr).toBe(true);
  expect(r.easyPace).toEqual({ sPerKm: 1800 / 5, seconds: 1800 });
});

test('heart rate out of band or without a band gives no easy pace', () => {
  expect(manualRuns([rec('manual-a', body({ avgHr: 160 }))], band)[0].easyPace).toBeNull();
  expect(manualRuns([rec('manual-a', body({ avgHr: 120 }))], null)[0].easyPace).toBeNull();
});

test('a manual treadmill run with heart rate gets no easy pace', () => {
  expect(manualRuns([rec('manual-a', body({ avgHr: 120, runType: 'treadmill_running' }))], band)[0].easyPace).toBeNull();
});

test('deleted, broken or non-manual run records are skipped', () => {
  const records = [
    rec('manual-a', body(), true),
    rec('manual-b', { type: 'manual', startMs: 'x' }),
    rec('settings', body()),
    rec('week-2027-06-14', body()),
    rec('manual-c', { type: 'send', week: '2027-06-14', fp: 'x', atMs: 1 }),
    { ...rec('manual-d', body()), kind: 'meal' as never },
    rec('manual-ok', body()),
  ];
  expect(manualRuns(records, null).map((r) => r.id)).toEqual(['manual-ok']);
});

test('manual best30M is its distance', () => {
  expect(manualRuns([rec('manual-a', body({ distanceM: 4200 }))], null)[0].best30M).toBe(4200);
});

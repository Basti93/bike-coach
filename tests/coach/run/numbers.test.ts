import { bandFor, capFor, easyPaceAt, maxHrOf, runNumbers, startPoint, suggestedDays } from '../../../src/coach/run/numbers';
import { kmText, paceText, type RunWeekBody } from '../../../src/shared/run';
import type { Run } from '../../../src/coach/run/garmin-runs';

const DAY = 86_400_000;
const NOW = new Date(2027, 5, 16, 12, 0).getTime(); // Wednesday
const run = (o: Partial<Run> = {}): Run => ({
  id: 'r', source: 'garmin', type: 'running', startMs: NOW - DAY, durationS: 2400, distanceM: 5000, avgHr: 130, maxHr: 150,
  elevationGainM: 10, hasHr: true, easyPace: { sPerKm: 400, seconds: 1800 }, best30M: null, tempC: 12, ...o,
});
const week = (w: string, runs: RunWeekBody['runs']): RunWeekBody => ({ type: 'week', week: w, announce: false, atMs: 1, phase: 1, source: 'rules', reason: '', note: null, runs, garmin: null });

test("maxHrOf prefers the highest seen, then the profile's hrMaxBpm, then maxHrBpm, else null", () => {
  expect(maxHrOf(180, [run({ maxHr: 190 })], { hrMaxBpm: 170, maxHrBpm: 160 })).toBe(190);
  expect(maxHrOf(null, [run({ maxHr: null })], { hrMaxBpm: 170, maxHrBpm: 160 })).toBe(170);
  expect(maxHrOf(null, [], { hrMaxBpm: undefined, maxHrBpm: 160 })).toBe(160);
  expect(maxHrOf(null, [], { hrMaxBpm: undefined, maxHrBpm: undefined })).toBeNull();
});

test('bandFor(190) is 114 to 143 and capFor(190) is 143; null without max HR', () => {
  expect(bandFor(190)).toEqual({ fromBpm: 114, toBpm: 143 });
  expect(capFor(190)).toBe(143);
  expect(bandFor(null)).toBeNull();
  expect(capFor(null)).toBeNull();
});

test('easyPaceAt weights the last 5 runs within 28 days by easy seconds and ignores older ones', () => {
  const runs = [
    run({ id: 'old', startMs: NOW - 40 * DAY, easyPace: { sPerKm: 100, seconds: 1000 } }),
    run({ id: 'x', startMs: NOW - 20 * DAY, easyPace: { sPerKm: 900, seconds: 1000 } }), // sixth newest, dropped
    ...[5, 4, 3, 2].map((d) => run({ id: `a${d}`, startMs: NOW - d * DAY, easyPace: { sPerKm: 400, seconds: 1000 } })),
    run({ id: 'b', startMs: NOW - DAY, easyPace: { sPerKm: 500, seconds: 2000 } }),
  ];
  // (4*400*1000 + 500*2000) / 6000 = 433.33
  expect(easyPaceAt(runs, NOW)).toBeCloseTo(433.33, 1);
  expect(easyPaceAt([], NOW)).toBeNull();
  expect(easyPaceAt([run({ easyPace: null })], NOW)).toBeNull();
});

test('runNumbers compares now with 4 and 12 weeks ago and gives null where there was no easy run', () => {
  const runs = [
    run({ id: 'n', startMs: NOW - DAY, easyPace: { sPerKm: 360, seconds: 1000 } }),
    run({ id: 'm', startMs: NOW - 28 * DAY - DAY, easyPace: { sPerKm: 400, seconds: 1000 } }),
  ];
  const n = runNumbers(runs, [], NOW);
  expect(n.easyPace.now).toBe(360);
  expect(n.easyPace.weeks4).toBe(400);
  expect(n.easyPace.weeks12).toBeNull();
  expect(n.easyPace.trend).toHaveLength(12);
});

test('weekly km and minutes count all four types; plannedMinutes comes from the week record', () => {
  const types = ['running', 'trail_running', 'track_running', 'treadmill_running'] as const;
  const runs = types.map((t, i) => run({ id: t, type: t, startMs: NOW - DAY - i * 1000, distanceM: 1000, durationS: 600 }));
  const plan = week('2027-06-14', [
    { date: '2027-06-15', kind: 'easy', minutes: 30, hrCap: null, counts: '', note: null, fp: 'a', done: null },
    { date: '2027-06-17', kind: 'long', minutes: 45, hrCap: null, counts: '', note: null, fp: 'b', done: null },
  ]);
  const n = runNumbers(runs, [plan], NOW);
  expect(n.weeks).toHaveLength(12);
  const cur = n.weeks[n.weeks.length - 1];
  expect(cur).toEqual({ week: '2027-06-14', km: 4, minutes: 40, plannedMinutes: 75 });
  expect(n.weeks[0].plannedMinutes).toBeNull();
});

test('the longest run is compared block against last block (28 days each)', () => {
  const runs = [
    run({ id: 'a', startMs: NOW - 3 * DAY, distanceM: 8000 }), run({ id: 'b', startMs: NOW - 10 * DAY, distanceM: 6000 }),
    run({ id: 'c', startMs: NOW - 35 * DAY, distanceM: 7000 }),
  ];
  expect(runNumbers(runs, [], NOW).longest).toEqual({ blockKm: 8, lastBlockKm: 7 });
  expect(runNumbers([], [], NOW).longest).toEqual({ blockKm: null, lastBlockKm: null });
});

test('best times appear only for test days, never for an ordinary run', () => {
  const fast = run({ id: 'fast', startMs: new Date(2027, 5, 15, 8).getTime(), best30M: 6500 });
  const test = run({ id: 'test', startMs: new Date(2027, 5, 17, 8).getTime(), best30M: 5200 });
  const plan = week('2027-06-14', [
    { date: '2027-06-15', kind: 'easy', minutes: 30, hrCap: null, counts: '', note: null, fp: 'a', done: null },
    { date: '2027-06-17', kind: 'test', minutes: 30, hrCap: null, counts: '', note: null, fp: 'b', done: null },
  ]);
  expect(runNumbers([fast, test], [plan], NOW).tests).toEqual([{ date: '2027-06-17', distanceM: 5200 }]);
});

test('suggestedDays picks weekdays with two runs in 56 days, else [1,3,5]', () => {
  const at = (d: number) => run({ id: `d${d}`, startMs: new Date(2027, 5, d, 8).getTime() });
  // 2027-06-14 Monday: Mondays 14, 7; Thursday 10 only once
  expect(suggestedDays([at(14), at(7), at(10)], NOW)).toEqual([0]);
  expect(suggestedDays([], NOW)).toEqual([1, 3, 5]);
  expect(startPoint([], NOW)).toEqual({ runsPerWeek: 0, typicalMinutes: 0, longestMinutes: 0, easyPace: null });
});

test('startPoint summarises 56 days', () => {
  const runs = [run({ id: 'a', startMs: NOW - DAY, durationS: 1800 }), run({ id: 'b', startMs: NOW - 8 * DAY, durationS: 3600 }), run({ id: 'o', startMs: NOW - 70 * DAY, durationS: 9000 })];
  const s = startPoint(runs, NOW);
  expect(s.longestMinutes).toBe(60);
  expect(s.typicalMinutes).toBe(45);
  expect(s.runsPerWeek).toBe(0.3);
});

test('paceText(372) is "6:12 /km" and kmText(5230) is "5,2 km"', () => {
  expect(paceText(372)).toBe('6:12 /km');
  expect(kmText(5230)).toBe('5,2 km');
});

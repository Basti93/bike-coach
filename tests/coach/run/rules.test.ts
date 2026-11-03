import { countsText, phaseOf, reasonText, ruleWeek, TEST_NOTE, weekDates, type RuleInput } from '../../../src/coach/run/rules';
import type { Run } from '../../../src/coach/run/garmin-runs';
import type { DayRating } from '../../../src/coach/day-load';
import type { RunKind } from '../../../src/shared/run';

const DAY = 86_400_000;
const WEEK = '2027-06-14'; // a Monday
const NOW = new Date(2027, 5, 14, 8, 0).getTime();
const at = (y: number, m: number, d: number, h = 7): number => new Date(y, m - 1, d, h).getTime();

const run = (startMs: number, minutes: number, o: Partial<Run> = {}): Run => ({
  id: `r${startMs}`, source: 'garmin', type: 'running', startMs, durationS: minutes * 60, distanceM: minutes * 160, avgHr: 130, maxHr: 150,
  elevationGainM: 10, hasHr: true, easyPace: { sPerKm: 400, seconds: 1200 }, best30M: null, tempC: 12, ...o,
});
/** The same week of runs (minutes per run, Monday, Wednesday, Friday, Sunday) in the three weeks before WEEK. */
const history = (perRun: number[]): Run[] =>
  [7, 14, 21].flatMap((back) => perRun.map((m, i) => run(at(2027, 6, 14 - back + 2 * i), m)));

const day = (date: string, hardness: DayRating['hardness'], legs = false): DayRating => ({ date, hardness, legs, minutes: hardness ? 60 : 0 });
const input = (o: Partial<RuleInput> = {}): RuleInput => ({
  nowMs: NOW, week: WEEK, fromDate: WEEK, runs: history([50, 50]), weekdays: [0, 2, 4], answers: null, maxHr: 190,
  complaint: null, days: {}, crossCut: () => 0, lastTestMs: null, phase: { phase: 1, since: WEEK }, restartSince: null, ...o,
});
/** A phase that began five weeks ago: not a light week, and old enough for a test. */
const OLD = { phase: 1 as const, since: '2027-05-10' };
const sum = (runs: { minutes: number }[]): number => runs.reduce((a, r) => a + r.minutes, 0);

test('the weekly time rises at most 10 % over the mean of the last 3 weeks', () => {
  const w = ruleWeek(input());
  expect(w.totalMinutes).toBeLessThanOrEqual(110);
  expect(w.totalMinutes).toBeGreaterThan(100);
  expect(w.runs).toHaveLength(3);
});

test('every fourth week of a phase is lighter (×0.7)', () => {
  const light = ruleWeek(input({ phase: { phase: 1, since: '2027-05-24' } }));
  expect(light.totalMinutes).toBeLessThanOrEqual(77);
  expect(light.totalMinutes).toBeGreaterThan(70);
  expect(ruleWeek(input({ phase: { phase: 1, since: '2027-05-31' } })).totalMinutes).toBeGreaterThan(100);
  expect(ruleWeek(input({ phase: { phase: 1, since: '2027-05-17' } })).totalMinutes).toBeGreaterThan(100);
  expect(ruleWeek(input({ phase: { phase: 1, since: '2027-04-26' } })).totalMinutes).toBeLessThanOrEqual(77);
});

test('without history the answers set the start; without answers 2 × 20 minutes', () => {
  const answered = ruleWeek(input({ runs: [], answers: { runsPerWeek: 3, usualMinutes: 30, pain: false } }));
  expect(answered.runs.map((r) => r.minutes)).toEqual([30, 30, 30]);
  const none = ruleWeek(input({ runs: [] }));
  expect(none.runs.map((r) => r.minutes)).toEqual([20, 20]);
  expect(none.totalMinutes).toBe(40);
});

test('runs land only on chosen weekdays from fromDate on, each at least 15 minutes; too few minutes means fewer runs', () => {
  const w = ruleWeek(input({ weekdays: [0, 2, 4, 6], fromDate: '2027-06-16' }));
  expect(w.runs.map((r) => r.date)).toEqual(['2027-06-16', '2027-06-18', '2027-06-20']);
  for (const r of w.runs) expect(r.minutes).toBeGreaterThanOrEqual(15);
  const few = ruleWeek(input({ runs: [], answers: { runsPerWeek: 3, usualMinutes: 10, pain: false } }));
  expect(few.runs).toHaveLength(2);
  for (const r of few.runs) expect(r.minutes).toBeGreaterThanOrEqual(15);
  expect(few.totalMinutes).toBeLessThanOrEqual(30);
});

test('phase 1 plans only easy runs with the cap at 75 % of max HR', () => {
  const w = ruleWeek(input({ runs: history([45, 45, 45, 30]), weekdays: [0, 2, 4, 6] }));
  expect(w.phase).toBe(1);
  expect(w.runs.length).toBeGreaterThan(0);
  for (const r of w.runs) {
    expect(r.kind).toBe('easy');
    expect(r.hrCap).toBe(143);
  }
  expect(w.reason).toContain('wieder fit');
});

test('without max HR there is no cap and the text says "so, dass du dich noch unterhalten kannst"', () => {
  const w = ruleWeek(input({ maxHr: null }));
  for (const r of w.runs) {
    expect(r.hrCap).toBeNull();
    expect(r.counts).toContain('so, dass du dich noch unterhalten kannst');
  }
});

test('phase 2 has one long run that grows at most 10 minutes over the last long run', () => {
  const w = ruleWeek(input({ runs: history([45, 45, 45, 30]), weekdays: [0, 2, 4, 6], phase: { phase: 2, since: WEEK } }));
  const long = w.runs.filter((r) => r.kind === 'long');
  expect(long).toHaveLength(1);
  expect(long[0]!.date).toBe('2027-06-20');
  expect(long[0]!.minutes).toBe(55);
  expect(w.maxRunMinutes).toBe(55);
  for (const r of w.runs) expect(r.minutes).toBeLessThanOrEqual(55);
  expect(w.totalMinutes).toBeLessThanOrEqual(Math.round(165 * 1.1));
  expect(w.reason).toContain('Distanz');
});

test('phaseOf moves to 2 after 3 runs a week in 4 of 5 weeks and back after a 21-day gap; an active complaint week does not count', () => {
  // three runs in each of the weeks from 2027-05-17 to 2027-06-07, none in the week of 2027-05-10
  const runs = ['2027-05-17', '2027-05-24', '2027-05-31', '2027-06-07'].flatMap((w) => {
    const [y, m, d] = w.split('-').map(Number);
    return [0, 2, 4].map((i) => run(at(y!, m!, d! + i), 30));
  });
  expect(phaseOf(runs, new Set(), NOW)).toEqual({ phase: 2, since: '2027-06-14' });
  expect(phaseOf(runs.slice(0, 11), new Set(), NOW).phase).toBe(1);
  expect(phaseOf(runs, new Set(['2027-05-24']), NOW).phase).toBe(1);
  const last = runs[runs.length - 1]!.startMs; // Friday 2027-06-11
  expect(phaseOf(runs, new Set(), last + 20 * DAY).phase).toBe(2);
  expect(phaseOf(runs, new Set(), last + 22 * DAY)).toEqual({ phase: 1, since: '2027-07-02' });
  expect(phaseOf([], new Set(), NOW)).toEqual({ phase: 1, since: '2027-06-14' });
});

test('a test run is due after 28 days, never in a light week, never with a complaint or pain answer', () => {
  const base = { runs: history([50, 50, 50, 50]), phase: OLD }; // 200 minutes a week
  const due = ruleWeek(input({ ...base, lastTestMs: NOW - 28 * DAY }));
  expect(due.testDate).toBe('2027-06-14');
  const test = due.runs.find((r) => r.kind === 'test')!;
  expect(test.minutes).toBe(45);
  expect(test.hrCap).toBeNull();
  expect(ruleWeek(input({ ...base, lastTestMs: NOW - 27 * DAY })).testDate).toBeNull();
  expect(ruleWeek(input({ ...base, lastTestMs: NOW - 28 * DAY, phase: { phase: 1, since: '2027-04-26' } })).testDate).toBeNull();
  for (const complaint of ['half', 'restart'] as const) {
    expect(ruleWeek(input({ ...base, lastTestMs: NOW - 28 * DAY, complaint })).testDate).toBeNull();
  }
  const pain = ruleWeek(input({ ...base, lastTestMs: NOW - 28 * DAY, answers: { runsPerWeek: 3, usualMinutes: 30, pain: true } }));
  expect(pain.testDate).toBeNull();
  expect(pain.runs.some((r) => r.kind === 'test')).toBe(false);
});

test('the test run goes only on a fresh day', () => {
  const base = { runs: history([50, 50, 50, 50]), lastTestMs: NOW - 28 * DAY, phase: OLD };
  const days: Record<string, DayRating> = {
    '2027-06-14': day('2027-06-14', 'hard'), // a hard bike day
    '2027-06-15': day('2027-06-15', 'hard', true), // legs, so Wednesday is not fresh
    '2027-06-19': day('2027-06-19', 'hard'), // a hard ride on Saturday, so Friday is not fresh
  };
  const none = ruleWeek(input({ ...base, days }));
  expect(none.testDate).toBeNull();
  expect(none.runs.some((r) => r.kind === 'test')).toBe(false);
  const { '2027-06-19': _, ...friday } = days;
  const w = ruleWeek(input({ ...base, days: friday }));
  expect(w.testDate).toBe('2027-06-18');
  expect(w.runs.find((r) => r.kind === 'test')!.date).toBe('2027-06-18');
});

test('easy runs may share a day with an easy ride; a hard day never gets a second hard thing', () => {
  const easy = ruleWeek(input({ weekdays: [0], days: { [WEEK]: day(WEEK, 'easy') } }));
  expect(easy.runs).toHaveLength(1);
  expect(easy.runs[0]!.kind).toBe('easy');
  expect(easy.runs[0]!.date).toBe(WEEK);
  const hard = ruleWeek(input({ weekdays: [0], runs: history([100, 100]), lastTestMs: NOW - 60 * DAY, phase: OLD, days: { [WEEK]: day(WEEK, 'hard') } }));
  expect(hard.testDate).toBeNull();
  for (const r of hard.runs) expect(r.kind).toBe('easy');
});

test('pause leaves no runs; half and restart halve the minutes and drop the test', () => {
  const base = { runs: history([50, 50, 50, 50]), lastTestMs: NOW - 28 * DAY, phase: OLD };
  const pause = ruleWeek(input({ ...base, complaint: 'pause' }));
  expect(pause.runs).toEqual([]);
  expect(pause.totalMinutes).toBe(0);
  expect(pause.testDate).toBeNull();
  expect(pause.reason).toContain('wieder fit');
  for (const complaint of ['half', 'restart'] as const) {
    const w = ruleWeek(input({ ...base, complaint }));
    expect(w.totalMinutes).toBeLessThanOrEqual(110);
    expect(w.totalMinutes).toBeGreaterThan(90);
    expect(w.runs.every((r) => r.kind === 'easy')).toBe(true);
  }
});

test('pain in the answers plans like a healing complaint', () => {
  const base = { runs: history([50, 50, 50, 50]), lastTestMs: NOW - 28 * DAY, phase: OLD };
  const pain = ruleWeek(input({ ...base, answers: { runsPerWeek: 3, usualMinutes: 30, pain: true } }));
  const half = ruleWeek(input({ ...base, answers: { runsPerWeek: 3, usualMinutes: 30, pain: false }, complaint: 'half' }));
  expect(pain.runs).toEqual(half.runs);
  expect(pain.totalMinutes).toBe(half.totalMinutes);
});

test('crossCut is applied after the ramp', () => {
  const seen: number[] = [];
  const w = ruleWeek(input({ crossCut: (m) => { seen.push(m); return m === 110 ? 20 : 0; } }));
  expect(seen).toEqual([110]);
  expect(w.totalMinutes).toBeLessThanOrEqual(90);
  expect(w.totalMinutes).toBeGreaterThan(80);
});

test('test minutes count double in the weekly load', () => {
  const w = ruleWeek(input({ runs: history([50, 50, 50, 50]), lastTestMs: NOW - 28 * DAY, phase: OLD }));
  const test = w.runs.filter((r) => r.kind === 'test');
  expect(test).toHaveLength(1);
  expect(w.totalMinutes).toBe(2 * 45 + sum(w.runs.filter((r) => r.kind !== 'test')));
  expect(w.totalMinutes).toBeLessThanOrEqual(220);
});

test('a DST week still has seven dates', () => {
  const d = weekDates('2026-10-26');
  expect(new Set(d).size).toBe(7);
  expect(d[0]).toBe('2026-10-26');
  expect(d[6]).toBe('2026-11-01');
});

test('every counts text is free of Rekord, Serie, Streak, musst, Pflicht', () => {
  const kinds: RunKind[] = ['easy', 'long', 'test'];
  for (const kind of kinds) {
    for (const cap of [null, 143]) {
      for (const trend of [true, false]) {
        const t = countsText(kind, 40, cap, trend);
        expect(t.length).toBeGreaterThan(0);
        expect(t.length).toBeLessThanOrEqual(400);
        expect(t).not.toMatch(/Rekord|Serie|Streak|musst|Pflicht/i);
      }
    }
  }
  expect(countsText('easy', 30, 143, false)).toContain('143');
  const banned = /Rekord|Serie|Streak|musst|Pflicht/i;
  expect(TEST_NOTE).not.toMatch(banned);
  const bools = [false, true];
  for (const phase of [1, 2] as const) {
    for (const mode of [null, 'pause', 'half', 'restart'] as const) {
      for (const light of bools) for (const noDay of bools) for (const tooFew of bools) for (const rising of bools) for (const long of ['placed', 'noDay', 'test', 'short'] as const) for (const test of bools) {
        const t = reasonText(phase, { mode, light, noDay, tooFew, rising, long, test });
        expect(t).toContain(phase === 1 ? 'wieder fit' : 'Distanz');
        expect(t).not.toMatch(banned);
      }
    }
  }
});

// ---- Fix round 1 ----

test('answers alone start at most 3 runs of 30 minutes and 90 minutes a week', () => {
  const big = ruleWeek(input({ runs: [], answers: { runsPerWeek: 5, usualMinutes: 120, pain: false }, weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  expect(big.runs.map((r) => r.minutes)).toEqual([30, 30, 30]);
  expect(big.totalMinutes).toBe(90);
  const two = ruleWeek(input({ runs: [], answers: { runsPerWeek: 2, usualMinutes: 60, pain: false } }));
  expect(two.runs.map((r) => r.minutes)).toEqual([30, 30]);
});

test('the base is the mean of the weeks since the first run, so the second week does not drop', () => {
  const runs = [0, 2, 4].map((i) => run(at(2027, 6, 7 + i), 30)); // only last week: 3 × 30
  const w = ruleWeek(input({ runs }));
  expect(w.totalMinutes).toBeGreaterThanOrEqual(90);
  expect(w.totalMinutes).toBeLessThanOrEqual(99);
});

test('no test in the first 28 days of a phase or after a restart, and none without a last test or switch-on time', () => {
  const base = { runs: history([50, 50, 50, 50]), lastTestMs: NOW - 60 * DAY };
  expect(ruleWeek(input({ ...base, phase: { phase: 1, since: '2027-05-31' } })).testDate).toBeNull();
  expect(ruleWeek(input({ ...base, phase: { phase: 1, since: '2027-05-17' } })).testDate).toBe(WEEK);
  expect(ruleWeek(input({ ...base, phase: OLD, restartSince: '2027-06-01' })).testDate).toBeNull();
  expect(ruleWeek(input({ ...base, phase: OLD, lastTestMs: null })).testDate).toBeNull();
});

test('after a restart the base counts only from the restart week', () => {
  const runs = [
    ...[21, 14].flatMap((back) => [0, 2, 4, 6].map((i) => run(at(2027, 6, 14 - back + i), 50))),
    run(at(2027, 6, 7), 27), run(at(2027, 6, 9), 27), // the restart week
  ];
  const after = ruleWeek(input({ runs, restartSince: '2027-06-07' }));
  expect(after.totalMinutes).toBeLessThanOrEqual(59);
  expect(after.totalMinutes).toBeGreaterThan(50);
  // the restart week itself still halves the old base
  const during = ruleWeek(input({ runs: history([50, 50, 50, 50]), restartSince: WEEK, complaint: 'restart' }));
  expect(during.totalMinutes).toBeGreaterThan(90);
  expect(during.totalMinutes).toBeLessThanOrEqual(110);
});

test('the long run goes on the latest day that is not hard and not after legs; without one there is no long run', () => {
  const p2 = { runs: history([45, 45, 45, 30]), weekdays: [0, 2, 4, 6], phase: { phase: 2 as const, since: WEEK } };
  const longOf = (w: ReturnType<typeof ruleWeek>) => w.runs.filter((r) => r.kind === 'long').map((r) => r.date);
  expect(longOf(ruleWeek(input({ ...p2, days: { '2027-06-20': day('2027-06-20', 'hard') } })))).toEqual(['2027-06-18']);
  expect(longOf(ruleWeek(input({ ...p2, days: { '2027-06-19': day('2027-06-19', 'moderate', true) } })))).toEqual(['2027-06-18']);
  const allHard = Object.fromEntries(['2027-06-14', '2027-06-16', '2027-06-18', '2027-06-20'].map((d) => [d, day(d, 'hard')]));
  const none = ruleWeek(input({ ...p2, days: allHard }));
  expect(longOf(none)).toEqual([]);
  expect(none.runs.length).toBeGreaterThan(0);
  expect(none.reason).not.toContain('lange Lauf wächst');
});

test('no test the day after a legs day, even when that day is not hard', () => {
  const base = { runs: history([50, 50, 50, 50]), lastTestMs: NOW - 60 * DAY, phase: OLD, weekdays: [0, 2] };
  expect(ruleWeek(input(base)).testDate).toBe(WEEK);
  const legs = { '2027-06-13': day('2027-06-13', 'moderate', true), '2027-06-15': day('2027-06-15', 'moderate', true) };
  expect(ruleWeek(input({ ...base, days: legs })).testDate).toBeNull();
});

test('a plan from mid-week gets only the share of the open days', () => {
  const w = ruleWeek(input({ weekdays: [0, 2, 4, 6], fromDate: '2027-06-16' }));
  expect(w.totalMinutes).toBeLessThanOrEqual(82);
  expect(w.totalMinutes).toBeGreaterThanOrEqual(75);
});

test('in phase 1 no run is more than 10 minutes over the longest recent run', () => {
  const w = ruleWeek(input({ runs: history([30, 30]), weekdays: [0] }));
  expect(w.runs.map((r) => r.minutes)).toEqual([40]);
});

test('hard days are filled last', () => {
  const w = ruleWeek(input({ runs: [], days: { [WEEK]: day(WEEK, 'hard') } }));
  expect(w.runs.map((r) => r.date)).toEqual(['2027-06-16', '2027-06-18']);
});

test('at most 5 runs a week', () => {
  expect(ruleWeek(input({ runs: history([50, 50, 50, 50]), weekdays: [0, 1, 2, 3, 4, 5, 6] })).runs).toHaveLength(5);
});

test('a test needs room for itself and one more run', () => {
  const base = { lastTestMs: NOW - 60 * DAY, phase: OLD };
  expect(ruleWeek(input({ ...base, runs: history([45, 45]) })).testDate).toBeNull(); // 99 minutes
  const w = ruleWeek(input({ ...base, runs: history([50, 50]) })); // 110 minutes
  expect(w.testDate).toBe(WEEK);
  expect(w.runs.filter((r) => r.kind !== 'test')).toHaveLength(1);
});

test('no test on the long-run day or the day before it', () => {
  const p2 = { runs: history([45, 45, 45, 30]), lastTestMs: NOW - 60 * DAY, phase: { phase: 2 as const, since: '2027-05-10' } };
  expect(ruleWeek(input({ ...p2, weekdays: [3, 6] })).testDate).toBe('2027-06-17');
  expect(ruleWeek(input({ ...p2, weekdays: [3, 6], days: { '2027-06-17': day('2027-06-17', 'hard') } })).testDate).toBeNull();
  expect(ruleWeek(input({ ...p2, weekdays: [5, 6] })).testDate).toBeNull();
});

test('a test week stays inside the ramp because the test counts double', () => {
  const w = ruleWeek(input({ runs: history([100, 100]), lastTestMs: NOW - 60 * DAY, phase: OLD }));
  expect(w.testDate).toBe(WEEK);
  expect(w.totalMinutes).toBeLessThanOrEqual(220);
  expect(w.totalMinutes).toBeGreaterThan(200);
});

test('the reason says "kein Lauftag" only without a free day and never "steigt" in a falling week', () => {
  const noDay = ruleWeek(input({ weekdays: [0], fromDate: '2027-06-15' }));
  expect(noDay.reason).toContain('kein Lauftag mehr frei');
  const tooFew = ruleWeek(input({ runs: [], weekdays: [0, 2, 4, 6], fromDate: '2027-06-20' }));
  expect(tooFew.runs).toEqual([]);
  expect(tooFew.reason).not.toContain('kein Lauftag');
  expect(ruleWeek(input()).reason).toContain('steigt');
  expect(ruleWeek(input({ crossCut: () => 30 })).reason).not.toContain('steigt');
  expect(ruleWeek(input({ runs: [] })).reason).not.toContain('steigt');
});

// ---- Fix round 2 ----

test('phase 2 without a long run keeps easy lengths, and the reason names the cause', () => {
  const p2 = { runs: history([45, 45, 45, 30]), lastTestMs: NOW - 60 * DAY, phase: { phase: 2 as const, since: '2027-05-10' } };
  const withTest = ruleWeek(input({ ...p2, weekdays: [4, 6] }));
  expect(withTest.testDate).toBe('2027-06-18');
  const sunday = withTest.runs.find((r) => r.date === '2027-06-20')!;
  expect(sunday.kind).toBe('easy');
  expect(sunday.minutes).toBeLessThanOrEqual(45);
  expect(withTest.reason).toContain('Testlauf statt');
  const allHard = Object.fromEntries(['2027-06-14', '2027-06-16', '2027-06-18', '2027-06-20'].map((d) => [d, day(d, 'hard')]));
  const noDay = ruleWeek(input({ ...p2, lastTestMs: null, weekdays: [0, 2, 4, 6], days: allHard }));
  expect(noDay.reason).toContain('passt kein Tag');
  for (const r of noDay.runs) expect(r.minutes).toBeLessThanOrEqual(45);
});

test('a test is refused on a moderate day of its own', () => {
  const w = ruleWeek(input({ runs: history([50, 50, 50, 50]), lastTestMs: NOW - 60 * DAY, phase: OLD, weekdays: [0, 2], days: { [WEEK]: day(WEEK, 'moderate') } }));
  expect(w.testDate).toBe('2027-06-16');
});

test('a thin history still plans a gentle 2 × 20', () => {
  const w = ruleWeek(input({ runs: [run(at(2027, 6, 7), 20)] }));
  expect(w.runs.map((r) => r.minutes)).toEqual([20, 20]);
});

test('a week with a single run day is never the test alone', () => {
  const w = ruleWeek(input({ runs: history([50, 50, 50, 50]), lastTestMs: NOW - 60 * DAY, phase: OLD, weekdays: [0] }));
  expect(w.testDate).toBeNull();
  expect(w.runs.map((r) => r.kind)).toEqual(['easy']);
});

test('the number of runs grows by at most one over last week', () => {
  expect(ruleWeek(input({ weekdays: [0, 1, 2, 3, 4, 5, 6] })).runs).toHaveLength(3); // two runs last week
  const three = [0, 2, 4].map((i) => run(at(2027, 6, 7 + i), 30));
  expect(ruleWeek(input({ runs: three, weekdays: [0, 1, 2, 3, 4, 5, 6] })).runs).toHaveLength(4);
});

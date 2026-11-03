import { countsText, phaseOf, ruleWeek, weekDates, type RuleInput } from '../../../src/coach/run/rules';
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
  complaint: null, days: {}, crossCut: () => 0, lastTestMs: null, phase: { phase: 1, since: WEEK }, ...o,
});
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
  const base = { runs: history([50, 50, 50, 50]) }; // 200 minutes a week
  const due = ruleWeek(input({ ...base, lastTestMs: NOW - 28 * DAY }));
  expect(due.testDate).toBe('2027-06-14');
  const test = due.runs.find((r) => r.kind === 'test')!;
  expect(test.minutes).toBe(45);
  expect(test.hrCap).toBeNull();
  expect(ruleWeek(input({ ...base, lastTestMs: NOW - 27 * DAY })).testDate).toBeNull();
  expect(ruleWeek(input({ ...base, lastTestMs: NOW - 28 * DAY, phase: { phase: 1, since: '2027-05-24' } })).testDate).toBeNull();
  for (const complaint of ['half', 'restart'] as const) {
    expect(ruleWeek(input({ ...base, lastTestMs: NOW - 28 * DAY, complaint })).testDate).toBeNull();
  }
  const pain = ruleWeek(input({ ...base, lastTestMs: NOW - 28 * DAY, answers: { runsPerWeek: 3, usualMinutes: 30, pain: true } }));
  expect(pain.testDate).toBeNull();
  expect(pain.runs.some((r) => r.kind === 'test')).toBe(false);
});

test('the test run goes only on a fresh day', () => {
  const base = { runs: history([50, 50, 50, 50]), lastTestMs: NOW - 28 * DAY };
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
  const hard = ruleWeek(input({ weekdays: [0], runs: history([100, 100]), lastTestMs: NOW - 60 * DAY, days: { [WEEK]: day(WEEK, 'hard') } }));
  expect(hard.testDate).toBeNull();
  for (const r of hard.runs) expect(r.kind).toBe('easy');
});

test('pause leaves no runs; half and restart halve the minutes and drop the test', () => {
  const base = { runs: history([50, 50, 50, 50]), lastTestMs: NOW - 28 * DAY };
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
  const base = { runs: history([50, 50, 50, 50]), lastTestMs: NOW - 28 * DAY };
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
  const w = ruleWeek(input({ runs: history([50, 50, 50, 50]), lastTestMs: NOW - 28 * DAY }));
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
});

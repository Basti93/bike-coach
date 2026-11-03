import { checkRunWeek, FORBIDDEN_WORDS } from '../../../src/coach/run/guardrails';
import { countsText, TEST_NOTE, type RuleWeek } from '../../../src/coach/run/rules';
import type { DayRating } from '../../../src/coach/day-load';
import type { PlannedRun } from '../../../src/shared/run';

const planned = (date: string, kind: PlannedRun['kind'], minutes: number): PlannedRun => {
  const hrCap = kind === 'test' ? null : 140;
  return { date, kind, minutes, hrCap, counts: countsText(kind, minutes, hrCap, false), note: kind === 'test' ? TEST_NOTE : null };
};
// Phase 2: two easy runs and a long run, 110 minutes, longest 50.
const RULE: RuleWeek = {
  runs: [planned('2027-06-15', 'easy', 30), planned('2027-06-17', 'easy', 30), planned('2027-06-19', 'long', 50)],
  reason: 'Phase „Distanz“: Ein langer ruhiger Lauf.', phase: 2, totalMinutes: 110, maxRunMinutes: 50, testDate: null,
};
const ALLOWED = ['2027-06-15', '2027-06-16', '2027-06-17', '2027-06-18', '2027-06-19', '2027-06-20'];
const answer = (runs: unknown[], extra: Record<string, unknown> = {}) => ({ runs, reason: 'Etwas anders verteilt.', ...extra });
const r = (date: string, kind: string, minutes: number, extra: Record<string, unknown> = {}) => ({ date, kind, minutes, ...extra });
const BASE = [r('2027-06-15', 'easy', 30), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50)];
const day = (date: string, hardness: DayRating['hardness'], legs = false): DayRating => ({ date, hardness, legs, minutes: 60 });
const refused = (raw: unknown, rule = RULE, days: Record<string, DayRating> = {}) => {
  const res = checkRunWeek(raw, rule, ALLOWED, days);
  expect(res.ok).toBe(false);
  return res.ok ? '' : res.reason;
};
const passes = (raw: unknown, rule = RULE, days: Record<string, DayRating> = {}) => {
  const res = checkRunWeek(raw, rule, ALLOWED, days);
  if (!res.ok) throw new Error(res.reason);
  return res;
};
// A week with a test run on Wednesday.
const TEST_RULE: RuleWeek = {
  runs: [planned('2027-06-15', 'easy', 25), planned('2027-06-17', 'test', 45), planned('2027-06-19', 'easy', 25)],
  reason: 'Phase „wieder fit“: Ruhige Läufe.', phase: 1, totalMinutes: 140, maxRunMinutes: 45, testDate: '2027-06-17',
};
const TEST_BASE = [r('2027-06-15', 'easy', 25), r('2027-06-17', 'test', 45), r('2027-06-19', 'easy', 25)];

test('a moved run on another allowed date is accepted with the rule cap and counts text', () => {
  const res = passes(answer([r('2027-06-16', 'easy', 30), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50)]));
  expect(res.runs.map((x) => x.date)).toEqual(['2027-06-16', '2027-06-17', '2027-06-19']);
  expect(res.runs[0]).toEqual({ ...planned('2027-06-16', 'easy', 30), note: null });
  expect(res.note).toBeNull();
  expect(res.reason).toBe('Etwas anders verteilt.');
});

test('a date outside the chosen weekdays or before fromDate is refused', () => {
  refused(answer([r('2027-06-14', 'easy', 30), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50)]));
  refused(answer([r('2027-06-15', 'easy', 30), r('2027-06-17', 'easy', 30), r('2027-06-21', 'long', 50)]));
  refused(answer([r('2027-06-15', 'easy', 30), r('2027-06-15', 'easy', 30), r('2027-06-19', 'long', 50)]));
});

test('more total minutes than the rule is refused; fewer down to 80 % is accepted', () => {
  refused(answer([r('2027-06-15', 'easy', 31), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50)]));
  passes(answer([r('2027-06-15', 'easy', 25), r('2027-06-17', 'easy', 25), r('2027-06-19', 'long', 38)]));
  refused(answer([r('2027-06-15', 'easy', 20), r('2027-06-17', 'easy', 20), r('2027-06-19', 'long', 40)]));
  refused(answer([r('2027-06-15', 'easy', 30), r('2027-06-17', 'easy', 30), r('2027-06-18', 'easy', 15), r('2027-06-19', 'long', 50)]));
});

test('a single run over the rule\'s longest or under 15 minutes is refused', () => {
  refused(answer([r('2027-06-15', 'easy', 14), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50)]));
  refused(answer([r('2027-06-15', 'easy', 10), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50)]));
  refused(answer([r('2027-06-15', 'easy', 20.5), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50)]));
  const short: RuleWeek = { ...RULE, totalMinutes: 110, maxRunMinutes: 40 };
  refused(answer(BASE), short);
});

test('a test run is refused unless the rule has one on that date', () => {
  passes(answer(TEST_BASE), TEST_RULE);
  const moved = refused(answer([r('2027-06-15', 'easy', 25), r('2027-06-18', 'test', 45), r('2027-06-19', 'easy', 25)]), TEST_RULE);
  expect(moved).toMatch(/Test/);
  refused(answer([r('2027-06-15', 'test', 45), r('2027-06-17', 'easy', 45), r('2027-06-19', 'easy', 25)]), TEST_RULE);
  refused(answer([r('2027-06-15', 'easy', 25), r('2027-06-17', 'test', 40), r('2027-06-19', 'easy', 25)]), TEST_RULE);
  // The rule has no test run at all.
  refused(answer([r('2027-06-15', 'easy', 30), r('2027-06-17', 'test', 45)]));
  // A test run on a day that is now hard, after legs, or before the long run.
  refused(answer(TEST_BASE), TEST_RULE, { '2027-06-17': day('2027-06-17', 'hard') });
  refused(answer(TEST_BASE), TEST_RULE, { '2027-06-16': day('2027-06-16', 'easy', true) });
  const longNext: RuleWeek = { ...TEST_RULE, phase: 2, runs: [planned('2027-06-15', 'easy', 25), planned('2027-06-17', 'test', 45), planned('2027-06-20', 'long', 25)] };
  passes(answer([r('2027-06-15', 'easy', 25), r('2027-06-17', 'test', 45), r('2027-06-20', 'long', 25)]), longNext);
  refused(answer([r('2027-06-15', 'easy', 25), r('2027-06-17', 'test', 45), r('2027-06-18', 'long', 25)]), longNext);
});

test('a long run in phase 1 is refused', () => {
  const one: RuleWeek = { ...RULE, phase: 1, runs: [planned('2027-06-15', 'easy', 50), planned('2027-06-17', 'easy', 30), planned('2027-06-19', 'easy', 30)] };
  passes(answer([r('2027-06-15', 'easy', 50), r('2027-06-17', 'easy', 30), r('2027-06-19', 'easy', 30)]), one);
  refused(answer([r('2027-06-15', 'easy', 30), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50)]), one);
});

test('a long run is refused when the rule has none, on a hard day, after legs, or twice', () => {
  const none: RuleWeek = { ...RULE, runs: [planned('2027-06-15', 'easy', 30), planned('2027-06-17', 'easy', 30), planned('2027-06-19', 'easy', 50)] };
  refused(answer(BASE), none);
  refused(answer(BASE), RULE, { '2027-06-19': day('2027-06-19', 'hard') });
  refused(answer(BASE), RULE, { '2027-06-18': day('2027-06-18', null, true) });
  refused(answer([r('2027-06-15', 'long', 30), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50)]));
  // Moved to a calm day it is accepted.
  passes(answer([r('2027-06-15', 'easy', 30), r('2027-06-17', 'easy', 30), r('2027-06-20', 'long', 50)]), RULE, { '2027-06-19': day('2027-06-19', 'hard') });
});

test('more runs than the rule has are refused, fewer are fine', () => {
  refused(answer([...BASE, r('2027-06-16', 'easy', 15)]), { ...RULE, totalMinutes: 140 });
  passes(answer([r('2027-06-17', 'easy', 50), r('2027-06-19', 'long', 50)]));
});

test('a note with "Rekord" or "musst" is refused; text over 300 characters is refused', () => {
  refused(answer(BASE, { note: 'Heute ein Rekord!' }));
  refused(answer(BASE, { note: 'Du musst laufen.' }));
  refused(answer(BASE, { reason: 'Eine neue Bestzeit wartet.' }));
  refused(answer([r('2027-06-15', 'easy', 30, { note: 'Pflicht heute' }), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50)]));
  refused(answer(BASE, { note: 'a'.repeat(301) }));
  refused(answer(BASE, { reason: 'a'.repeat(301) }));
  refused(answer(BASE, { reason: '' }));
  passes(answer(BASE, { note: 'a'.repeat(300) }));
  expect(FORBIDDEN_WORDS.test('Serie')).toBe(true);
  expect(FORBIDDEN_WORDS.test('Diagnose')).toBe(true);
  expect(FORBIDDEN_WORDS.test('Seriös')).toBe(false);
});

test('a kept note is returned, the test note stays the rule text', () => {
  const res = passes(answer(TEST_BASE.map((x) => ({ ...x, note: x.kind === 'test' ? 'Anders' : 'Locker bleiben.' })), { note: 'Eine ruhige Woche.' }), TEST_RULE);
  expect(res.note).toBe('Eine ruhige Woche.');
  expect(res.runs[0]!.note).toBe('Locker bleiben.');
  expect(res.runs[1]!.note).toBe(TEST_NOTE);
});

test('hrCap always comes from the rule, whatever Claude wrote', () => {
  const res = passes(answer([r('2027-06-15', 'easy', 30, { hrCap: 190 }), r('2027-06-17', 'easy', 30), r('2027-06-19', 'long', 50, { hrCap: 99 })]));
  expect(res.runs.map((x) => x.hrCap)).toEqual([140, 140, 140]);
  const t = passes(answer(TEST_BASE.map((x) => ({ ...x, hrCap: 150 }))), TEST_RULE);
  expect(t.runs.map((x) => x.hrCap)).toEqual([140, null, 140]);
});

test('garbage and unknown kinds are refused', () => {
  refused(null);
  refused({ runs: 'x', reason: 'a' });
  refused(answer([r('2027-06-15', 'sprint', 30)]));
  refused(answer([r('2027-06-15', 'easy', Number.NaN)]));
});

test('an empty rule week accepts only an empty answer', () => {
  const empty: RuleWeek = { runs: [], reason: 'Pause.', phase: 1, totalMinutes: 0, maxRunMinutes: 0, testDate: null };
  expect(passes(answer([]), empty).runs).toEqual([]);
  refused(answer([r('2027-06-15', 'easy', 20)]), empty);
});

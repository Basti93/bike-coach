import { checkWeekPlan, mondayOf, parseProposal, planFor, weekDates, type PlanDay } from '../../src/shared/week-plan';

const day = (date: string, sport: PlanDay['sport'], hardness: PlanDay['hardness'] = 'easy', extra: Partial<PlanDay> = {}): PlanDay => ({ date, sport, hardness, fixed: false, ...extra });
const week = (days: Partial<Record<number, PlanDay>>) => weekDates('2026-11-02').map((d, i) => days[i] ? { ...days[i]!, date: d } : day(d, 'rest'));

test('weeks start on Monday', () => {
  expect(mondayOf('2026-11-04')).toBe('2026-11-02');
  expect(mondayOf('2026-11-08')).toBe('2026-11-02');
  expect(mondayOf('2026-11-09')).toBe('2026-11-09');
  expect(weekDates('2026-11-02')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
});

test('a calm week breaks no rule', () => {
  expect(checkWeekPlan(week({ 0: day('', 'gym', 'moderate', { legs: true }), 2: day('', 'bike', 'hard'), 4: day('', 'run', 'easy') }))).toEqual([]);
});
test('three hard days break the first rule', () => {
  const v = checkWeekPlan(week({ 0: day('', 'bike', 'hard'), 2: day('', 'bike', 'hard'), 4: day('', 'run', 'hard') }));
  expect(v).toEqual(['Mehr als zwei harte Tage in der Woche.']);
});
test('no hard bike or run day after a hard leg day, and no long session after any leg day', () => {
  expect(checkWeekPlan(week({ 0: day('', 'gym', 'hard', { legs: true }), 1: day('', 'run', 'hard') })))
    .toEqual(['Harter Rad- oder Lauftag am Tag nach einem harten Beintag (Dienstag).']);
  expect(checkWeekPlan(week({ 0: day('', 'gym', 'easy', { legs: true }), 1: day('', 'bike', 'moderate', { long: true }) })))
    .toEqual(['Lange Einheit am Tag nach einem Beintag (Dienstag).']);
  expect(checkWeekPlan(week({ 0: day('', 'gym', 'hard', { legs: false }), 1: day('', 'run', 'hard') }))).toEqual([]);
});

test('a proposal must be seven valid days of one week, otherwise it is dropped', () => {
  const ok = { weekStart: '2026-11-02', days: week({ 1: day('', 'gym', 'moderate', { legs: true, note: 'Studio' }) }) };
  expect(parseProposal(ok)).toEqual(ok);
  expect(parseProposal({ ...ok, days: ok.days.slice(1) })).toBeNull();
  expect(parseProposal({ ...ok, weekStart: '2026-11-03' })).toBeNull();
  expect(parseProposal({ ...ok, days: ok.days.map((d, i) => (i === 2 ? { ...d, sport: 'swim' } : d)) })).toBeNull();
  expect(parseProposal({ ...ok, days: ok.days.map((d, i) => (i === 2 ? { ...d, date: '2026-12-01' } : d)) })).toBeNull();
});

test('planFor gives the plan of a date from the accepted plan records, deleted ones ignored', () => {
  const plan = { weekStart: '2026-11-02', days: week({ 3: day('', 'bike', 'hard') }), fromMessage: 'm1', acceptedMs: 1 };
  const recs = [{ kind: 'weekplan' as const, id: '2026-11-02', updatedMs: 1, deleted: false, body: plan }];
  expect(planFor(recs, '2026-11-05')).toMatchObject({ sport: 'bike', hardness: 'hard' });
  expect(planFor(recs, '2026-11-12')).toBeNull();
  expect(planFor([{ ...recs[0], deleted: true }], '2026-11-05')).toBeNull();
});

import { planHint } from '../../../src/coach/chat/plan-hint';
import type { TrackedRecord } from '../../../src/shared/records';
import { weekDates } from '../../../src/shared/week-plan';

const NOW = new Date(2026, 10, 7, 9).getTime(); // Saturday 2026-11-07
const plan = (monday: string, sportOn: Record<number, string>): TrackedRecord => ({ kind: 'weekplan', id: monday, updatedMs: 1, deleted: false,
  body: { weekStart: monday, fromMessage: 'm', acceptedMs: 1, days: weekDates(monday).map((date, i) => ({ date, sport: sportOn[i] ?? 'rest', hardness: 'easy', fixed: false })) } });

test('empty without a plan', () => expect(planHint([], NOW, 'gym')).toBe(''));
test('shows the next seven days across the week border, and names the sport', () => {
  const h = planHint([plan('2026-11-02', { 5: 'gym' }), plan('2026-11-09', { 1: 'bike' })], NOW, 'bike');
  expect(h).toContain('"date":"2026-11-07"');
  expect(h).toContain('"date":"2026-11-10"');
  expect(h).not.toContain('2026-11-14');
  expect(h).toContain('sport "bike"');
});

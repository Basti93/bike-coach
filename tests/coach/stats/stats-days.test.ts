import { lastDates, statsDays, type StatsInput } from '../../../src/coach/stats/stats-days';
import type { DayRating } from '../../../src/coach/day-load';

const at = (d: number, h = 10) => new Date(2027, 5, d, h).getTime(); // 14 June 2027 is a Monday
const DATES = Array.from({ length: 7 }, (_, i) => `2027-06-${String(14 + i).padStart(2, '0')}`);
const empty: StatsInput = { rides: [], strength: [], runs: [], mobility: [], other: [], ratings: {} };

test('minutes land on the right date and sport', () => {
  const ratings: Record<string, DayRating> = { '2027-06-14': { date: '2027-06-14', hardness: 'hard', legs: true, minutes: 0 } };
  const days = statsDays({
    ...empty, ratings,
    rides: [{ startedAtMs: at(14), durationS: 3600 }],
    strength: [{ startMs: at(15), durationS: 2700 }],
    runs: [{ startMs: at(16), durationS: 1800 }],
    mobility: [{ doneMs: at(17), minutes: 10 }],
    other: [{ startMs: at(18), durationS: 1200, sport: 'yoga' }],
  }, DATES);
  expect(days).toHaveLength(7);
  expect(days[0]).toEqual({ date: '2027-06-14', minutes: { bike: 60, strength: 0, run: 0, mobility: 0, other: 0 }, hardness: 'hard', legs: true });
  expect(days[1]!.minutes.strength).toBe(45);
  expect(days[2]!.minutes.run).toBe(30);
  expect(days[3]!.minutes.mobility).toBe(10);
  expect(days[4]!.minutes.other).toBe(20);
});

test('a date with nothing has zeros and no hardness', () => {
  expect(statsDays(empty, ['2027-06-14'])[0]).toEqual({ date: '2027-06-14', minutes: { bike: 0, strength: 0, run: 0, mobility: 0, other: 0 }, hardness: null, legs: false });
});

test('lastDates on a Wednesday starts on a Monday and ends today', () => {
  const d = lastDates(new Date(2027, 5, 16, 15).getTime());
  expect(d).toHaveLength(8 * 7 + 3);
  expect(d[0]).toBe('2027-04-19');
  expect(new Date(2027, 3, 19).getDay()).toBe(1);
  expect(d[d.length - 1]).toBe('2027-06-16');
});

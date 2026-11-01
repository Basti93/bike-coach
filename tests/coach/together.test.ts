import type { RideSummary } from '../../src/coach/metrics';
import { rideStats } from '../../src/coach/stats';
import { computeTogether } from '../../src/coach/together';
import type { CoachState } from '../../src/coach/state';
import { DUTCH_WORDS, learnedCount, nextWord, recordAnswer, type WordProgress } from '../../src/shared/language';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 28, 12); // Wednesday
const person = (profileId: string, rides: { daysAgo: number; minutes: number; power?: number }[]) => ({
  profileId, wordProgress: {},
  summaries: rides.map((r, i) => ({ rideId: `${profileId}${i}`, startedAtMs: NOW - r.daysAgo * DAY, durationS: r.minutes * 60, avgPowerW: r.power ?? 100 })),
}) as unknown as CoachState;
const profiles = [{ id: 'a', name: 'Anna', ftpW: 250 }, { id: 'b', name: 'Ben', ftpW: 120 }];

test('watts do not matter: same minutes give the same result', () => {
  const t = computeTogether(profiles, [person('a', [{ daysAgo: 1, minutes: 30, power: 300 }]), person('b', [{ daysAgo: 1, minutes: 30, power: 90 }])], NOW);
  expect(t.people[0]).toMatchObject({ ridesThisWeek: 1, minutesThisWeek: 30 });
  expect(t.people[1]).toMatchObject({ ridesThisWeek: 1, minutesThisWeek: 30 });
  expect(t.metres).toBe(600);
  expect(t.line).toContain('Gleichstand');
  expect(JSON.stringify(t)).not.toMatch(/power|ftp/i);
});
test('streak survives an unfinished current week and breaks on a missed week', () => {
  const t = computeTogether(profiles, [person('a', [{ daysAgo: 7, minutes: 30 }, { daysAgo: 14, minutes: 30 }, { daysAgo: 28, minutes: 30 }])], NOW);
  expect(t.people[0].streakWeeks).toBe(2);
});
test('shared mountain moves on after the summit', () => {
  const t = computeTogether(profiles, [person('a', [{ daysAgo: 1, minutes: 120 }])], NOW);
  expect(t.peak).toMatchObject({ name: 'Mont Ventoux', done: 100 });
});
test('answers go through FSRS and survive a save and reload', () => {
  const list = DUTCH_WORDS.slice(0, 3);
  const reload = (p: WordProgress): WordProgress => JSON.parse(JSON.stringify(p));
  const nl = list[0].nl;
  expect(nextWord(list, {}, NOW)?.nl).toBe(nl);
  let p = reload(recordAnswer({}, nl, true, NOW));
  expect(nextWord(list, p, NOW)?.nl).toBe(list[1].nl);
  let at = NOW;
  for (let i = 0; i < 4; i++) { at = new Date(p[nl].card.due).getTime(); p = reload(recordAnswer(p, nl, true, at)); }
  const interval = new Date(p[nl].card.due).getTime() - at;
  expect(interval).toBeGreaterThan(DAY);
  expect(learnedCount(p)).toBe(1);
  p = reload(recordAnswer(p, nl, false, at));
  expect(new Date(p[nl].card.due).getTime() - at).toBeLessThan(interval);
});
test('new words are limited per day and due words still come', () => {
  let p: WordProgress = {};
  for (const w of DUTCH_WORDS.slice(0, 15)) p = recordAnswer(p, w.nl, true, NOW);
  const later = NOW + 3 * 3_600_000;
  for (const w of DUTCH_WORDS.slice(0, 15)) p[w.nl].card = { ...p[w.nl].card, due: new Date(later + DAY) };
  expect(nextWord(DUTCH_WORDS, p, later)).toBeNull();
  expect(nextWord(DUTCH_WORDS, p, later + DAY)?.nl).toBe(DUTCH_WORDS[0].nl);
});
test('word list is usable: every card has translation and example containing content', () => {
  expect(DUTCH_WORDS.length).toBeGreaterThan(300);
  expect(new Set(DUTCH_WORDS.map((w) => w.nl)).size).toBe(DUTCH_WORDS.length);
  for (const w of DUTCH_WORDS) expect(w.de && w.example && w.exampleDe).toBeTruthy();
});
test('stats add up and faulty rides do not set records', () => {
  const s = rideStats([
    { startedAtMs: NOW - DAY, durationS: 1800, bestMinutePowerW: 200 },
    { startedAtMs: NOW - 8 * DAY, durationS: 3600, bestMinutePowerW: 999, suspectData: true },
  ] as RideSummary[], NOW);
  expect(s).toMatchObject({ rides: 2, minutes: 90, longestMinutes: 60, bestMinuteW: 200 });
  expect(s.weeks).toHaveLength(12);
  expect(s.weeks.at(-1)?.minutes).toBe(30);
});

describe('summit book', () => {
  const rides = (profileId: string, list: { daysAgo: number; minutes: number }[]) => person(profileId, list);
  const both = [{ id: 'a', name: 'Anna', ftpW: 250 }, { id: 'b', name: 'Ben', ftpW: 120 }];

  test('records when you reached a mountain together, in the order of the rides', () => {
    const t = computeTogether(both, [rides('a', [{ daysAgo: 5, minutes: 60 }, { daysAgo: 1, minutes: 30 }]), rides('b', [{ daysAgo: 3, minutes: 30 }])], NOW);
    expect(t.summits).toEqual([{ name: 'Alpe d’Huez', atMs: NOW - 1 * DAY }]);
  });
  test('holds no shares per person', () => {
    const t = computeTogether(both, [rides('a', [{ daysAgo: 1, minutes: 200 }]), rides('b', [])], NOW);
    expect(Object.keys(t.summits[0]).sort()).toEqual(['atMs', 'name']);
  });
  test('reaching the top exactly counts, and the next mountain starts at zero', () => {
    const t = computeTogether(both, [rides('a', [{ daysAgo: 1, minutes: 110 }]), rides('b', [])], NOW);
    expect(t.summits).toHaveLength(1);
    expect(t.peak).toMatchObject({ name: 'Mont Ventoux', done: 0, total: 1600, next: 'Stilfser Joch' });
  });
  test('the mountains never end: after the last one they start again', () => {
    const t = computeTogether(both, [rides('a', [{ daysAgo: 1, minutes: 1335 + 30 }]), rides('b', [])], NOW);
    expect(t.summits.map((s) => s.name)).toEqual(['Alpe d’Huez', 'Mont Ventoux', 'Stilfser Joch', 'Mount Everest']);
    expect(t.peak).toMatchObject({ name: 'Alpe d’Huez, 2. Mal', done: 300, total: 1100, next: 'Mont Ventoux, 2. Mal' });
  });
  test('without rides the book is empty', () => {
    expect(computeTogether(both, [rides('a', []), rides('b', [])], NOW).summits).toEqual([]);
  });
});

test('the summit book also holds who climbed which real mountain, without watts', () => {
  const a = { ...person('a', []), pass: { summits: [{ passId: 'brocken', atMs: NOW - DAY }] } } as unknown as CoachState;
  const t = computeTogether([{ id: 'a', name: 'Anna', ftpW: 250 }], [a], NOW);
  expect(t.climbed).toEqual([{ who: 'Anna', name: 'Brocken', atMs: NOW - DAY }]);
});

test('the overview shows who is on the way up which mountain, in percent', () => {
  const a = { ...person('a', []), pass: { selectedId: 'brocken', distanceM: { brocken: 4160 } } } as unknown as CoachState;
  const b = person('b', []);
  const t = computeTogether([{ id: 'a', name: 'Anna', ftpW: 250 }, { id: 'b', name: 'Ben', ftpW: 200 }], [a, b], NOW);
  expect(t.climbing).toEqual([{ who: 'Anna', name: 'Brocken', pct: 50 }]);
});

test('someone riding the default mountain without choosing one also shows up', () => {
  const a = { ...person('a', []), pass: { distanceM: { 'alpe-dhuez': 7550 } } } as unknown as CoachState;
  const t = computeTogether([{ id: 'a', name: 'Anna', ftpW: 250 }], [a], NOW);
  expect(t.climbing).toEqual([{ who: 'Anna', name: 'Alpe d’Huez', pct: 50 }]);
});

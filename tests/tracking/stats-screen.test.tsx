// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import { STATS_ID, type Sport, type StatsBody, type StatsDay } from '../../src/shared/stats';
import { StatsScreen, statsVisible } from '../../src/tracking/ui/StatsScreen';
import { dateLabel } from '../../src/tracking/ui/labels';
import { fakePort } from './fake-port';

afterEach(cleanup);

// Wednesday 4 November 2026, 10:00 local time; the current week starts Monday 2 November.
const NOW = new Date(2026, 10, 4, 10).getTime();
const now = () => NOW;
const zero = (): Record<Sport, number> => ({ bike: 0, strength: 0, run: 0, mobility: 0, other: 0 });
const day = (date: string, minutes: Partial<Record<Sport, number>>, hardness: StatsDay['hardness'] = null): StatsDay => ({ date, minutes: { ...zero(), ...minutes }, hardness, legs: false });
const statsBody = (days: StatsDay[], over: Partial<StatsBody> = {}): StatsBody => ({ type: 'stats', atMs: NOW - 3_600_000, goal: 'muscle', days, muscles: {}, ...over });
const statsRec = (body: StatsBody): TrackedRecord => ({ kind: 'stats', id: STATS_ID, updatedMs: 1, deleted: false, body });
const set = () => ({ type: 'normal' as const, weightKg: 50, reps: 8, durationS: null, doneMs: 1 });
const workout = (id: string, startMs: number, exerciseId: string, title: string, n: number): TrackedRecord => {
  const body: LoggedWorkout = { id, title: 'Training', startMs, endMs: startMs + 3_600_000, source: 'pandafit', exercises: [{ exerciseId, title, supersetId: null, notes: '', sets: Array.from({ length: n }, set) }] };
  return { kind: 'workout', id, updatedMs: 1, deleted: false, body };
};

const days = [
  day('2026-10-20', { bike: 60 }, 'hard'),
  day('2026-10-27', { bike: 45, strength: 50 }, 'moderate'),
  day('2026-11-02', { bike: 30 }, 'hard'),
  day('2026-11-03', { strength: 40 }),
];
const workouts = [
  workout('w1', new Date(2026, 10, 3, 18).getTime(), 'pf-bench-press', 'Bankdrücken', 3),
  workout('w2', new Date(2026, 9, 27, 18).getTime(), 'hevy-odd', 'Seltsame Maschine', 2),
];
const BAD = /Serie|Streak|Punkte|musst/;

async function show(seed: TrackedRecord[]) {
  const { port } = fakePort(seed);
  const r = render(<StatsScreen port={port} now={now} />);
  await screen.findByRole('heading', { name: 'Statistik' });
  return r;
}

test('with a stats record and workouts: both sections, the date, the band and the unknown list', async () => {
  const { container } = await show([statsRec(statsBody(days)), ...workouts]);
  expect(screen.getByText(`Stand: ${dateLabel(NOW - 3_600_000)}`)).toBeTruthy();
  const week = screen.getByRole('region', { name: 'Diese Woche' });
  expect(within(week).getByText('Rad')).toBeTruthy();
  expect(within(week).getByText('30 Minuten')).toBeTruthy();
  expect(within(week).getByText('Kraft')).toBeTruthy();
  expect(within(week).getByText('40 Minuten')).toBeTruthy();
  expect(within(week).queryByText('Laufen')).toBeNull();
  expect(within(week).getByText('Harte Tage: 1')).toBeTruthy();
  expect(within(week).getByText('Brust')).toBeTruthy();
  expect(within(week).getByText('3 von 12–18 Sätzen')).toBeTruthy();
  const last = screen.getByRole('region', { name: 'Letzte 8 Wochen' });
  expect(within(last).getByRole('img', { name: 'Woche vom 26.10.: 95 Minuten' })).toBeTruthy();
  expect(within(last).getByRole('img', { name: 'Woche vom 19.10.: 60 Minuten' })).toBeTruthy();
  expect(within(last).getByRole('table')).toBeTruthy();
  expect(within(last).getByText('Brust 0 : 0 Rücken')).toBeTruthy();
  expect(screen.getByText('Ohne bekannten Muskel: Seltsame Maschine')).toBeTruthy();
  expect(container.textContent).not.toMatch(BAD);
});

test('without a stats record: the note, and still the muscle part', async () => {
  const { container } = await show(workouts);
  expect(screen.getByText('Minuten und harte Tage erscheinen nach dem nächsten Lauf des Coaches.')).toBeTruthy();
  expect(screen.queryByText(/^Stand:/)).toBeNull();
  const week = screen.getByRole('region', { name: 'Diese Woche' });
  expect(within(week).getByText('Brust')).toBeTruthy();
  expect(within(week).getByText('3 von 6–8 Sätzen')).toBeTruthy();
  expect(within(week).queryByText(/Harte Tage/)).toBeNull();
  expect(container.textContent).not.toMatch(BAD);
});

test('a bike-only profile sees no muscle part at all', async () => {
  const { container } = await show([statsRec(statsBody([day('2026-10-27', { bike: 60 }), day('2026-11-02', { bike: 40 })], { goal: null }))]);
  const week = screen.getByRole('region', { name: 'Diese Woche' });
  expect(within(week).getByText('40 Minuten')).toBeTruthy();
  expect(container.textContent).not.toMatch(/Sätze|Brust|Rücken|Ohne bekannten Muskel/);
  expect(screen.queryByRole('table')).toBeNull();
  expect(container.textContent).not.toMatch(BAD);
});

test('statsVisible: a stats record or a finished workout', () => {
  expect(statsVisible(null, null)).toBe(false);
  expect(statsVisible([], [])).toBe(false);
  expect(statsVisible([statsRec(statsBody([]))], [])).toBe(true);
  expect(statsVisible([{ ...statsRec(statsBody([])), body: { type: 'nope' } }], [])).toBe(false);
  expect(statsVisible([], [workouts[0]])).toBe(true);
  const open = { ...workouts[0], body: { ...(workouts[0].body as LoggedWorkout), endMs: null } };
  expect(statsVisible([], [open])).toBe(false);
});

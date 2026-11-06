// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  expect(within(week).getByText('Locker 0 · Mittel 0 · Hart 1 · Ruhetage 0')).toBeTruthy();
  expect(within(week).getByText('Brust')).toBeTruthy();
  expect(within(within(week).getByRole('button', { name: /Brust/ })).getByText('Wenig')).toBeTruthy();
  expect(week.textContent).not.toMatch(/\bvon\b.*Sätzen/);
  const last = screen.getByRole('region', { name: 'Letzte 8 Wochen' });
  expect(within(last).getByRole('img', { name: 'Woche vom 26.10.: 95 Minuten, Locker 0, Mittel 1, Hart 0, Ruhetage 0' })).toBeTruthy();
  expect(within(last).getByRole('img', { name: 'Woche vom 19.10.: 60 Minuten, Locker 0, Mittel 0, Hart 1, Ruhetage 0' })).toBeTruthy();
  expect(within(last).getByRole('table')).toBeTruthy();
  // Every pair is 0 : 0 over the four weeks: none is shown.
  expect(within(last).queryByText(/0 : 0/)).toBeNull();
  expect(within(last).queryByText('Verhältnis der letzten 4 Wochen')).toBeNull();
  expect(screen.getByText('Ohne bekannten Muskel: Seltsame Maschine')).toBeTruthy();
  expect(container.textContent).not.toMatch(BAD);
});

test('without a stats record: the note, and still the muscle part', async () => {
  const { container } = await show(workouts);
  expect(screen.getByText('Minuten und harte Tage erscheinen nach dem nächsten Lauf des Coaches.')).toBeTruthy();
  expect(screen.queryByText(/^Stand:/)).toBeNull();
  const week = screen.getByRole('region', { name: 'Diese Woche' });
  expect(within(week).getByText('Brust')).toBeTruthy();
  expect(within(within(week).getByRole('button', { name: /Brust/ })).getByText('Wenig')).toBeTruthy();
  expect(within(week).queryByText(/Harte Tage|Ruhetage/)).toBeNull();
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

test('a pair with sets is shown, a pair with none on both sides is not', async () => {
  await show([workout('w3', new Date(2026, 9, 21, 18).getTime(), 'pf-bench-press', 'Bankdrücken', 4)]);
  const last = screen.getByRole('region', { name: 'Letzte 8 Wochen' });
  expect(within(last).getByText('Brust 4 : 0 Rücken')).toBeTruthy();
  expect(within(last).queryByText(/Oberschenkel vorn 0 : 0/)).toBeNull();
});

test('broken workout bodies next to a good one do not break the page', async () => {
  const good = workouts[0];
  const broken: TrackedRecord[] = [
    { ...good, id: 'b1', body: null },
    { ...good, id: 'b2', body: { ...(good.body as LoggedWorkout), exercises: 'x' } },
    { ...good, id: 'b3', body: { ...(good.body as LoggedWorkout), startMs: null } },
    { ...good, id: 'b4', body: { ...(good.body as LoggedWorkout), exercises: [{ exerciseId: 'pf-bench-press', title: 'Bankdrücken', sets: null }] } },
  ];
  await show([...broken, good]);
  const week = screen.getByRole('region', { name: 'Diese Woche' });
  expect(within(within(week).getByRole('button', { name: /Brust/ })).getByText('Wenig')).toBeTruthy();
  expect(statsVisible([], broken.slice(0, 3))).toBe(false);
  expect(statsVisible([], [...broken, good])).toBe(true);
});

test('a failed first read shows a calm message with a retry', async () => {
  const { port, state } = fakePort([statsRec(statsBody(days)), ...workouts]);
  state.failList = true;
  render(<StatsScreen port={port} now={now} />);
  expect((await screen.findByRole('status')).textContent).toMatch(/nicht gelesen/);
  state.failList = false;
  fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }));
  expect(await screen.findByRole('heading', { name: 'Statistik' })).toBeTruthy();
});

test('Fortschritt shows one line per area with data and nothing for the rest', async () => {
  const at = Date.UTC(2026, 10, 4, 12);
  const body = { type: 'stats', atMs: at, goal: null, days: [], muscles: {}, ftp: [{ atMs: at - 70 * 86_400_000, ftpW: 200 }, { atMs: at - 86_400_000, ftpW: 210 }], weightKg: 70 };
  const { port } = fakePort([{ kind: 'stats', id: 'stats', updatedMs: 1, deleted: false, body }]);
  render(<StatsScreen port={port} now={() => at} />);
  const card = await screen.findByRole('region', { name: 'Fortschritt' });
  expect(card.textContent).toContain('FTP 210 W · 3,0 W/kg');
  expect(card.textContent).toContain('+10 W seit 10 Wochen');
  expect(card.querySelectorAll('dt')).toHaveLength(1);
});

test('rows exist for trained groups; untrained groups are one muted line', async () => {
  await show([statsRec(statsBody(days)), ...workouts]);
  const week = screen.getByRole('region', { name: 'Diese Woche' });
  expect(within(within(week).getByRole('button', { name: /Brust/ })).getByText('Wenig')).toBeTruthy();
  expect(within(week).queryByRole('button', { name: /Rücken/ })).toBeNull();
  const line = within(week).getByText(/^Noch nichts: /);
  expect(line.textContent).toMatch(/Rücken.*Bizeps/);
  expect(line.textContent).not.toMatch(/Brust/);
  expect(within(week).queryByText('Noch nichts', { selector: '.tk-state *, .tk-state' })).toBeNull();
  fireEvent.click(within(week).getByRole('button', { name: 'Alle Muskelgruppen anzeigen' }));
  expect(within(within(week).getByRole('button', { name: /Rücken/ })).getByText('Noch nichts')).toBeTruthy();
  expect(within(week).queryByText(/^Noch nichts: /)).toBeNull();
});

test('the sets table counts effective sets like the states', async () => {
  await show([workout('w8', new Date(2026, 9, 27, 18).getTime(), 'pf-bench-press', 'Bankdrücken', 4)]);
  const table = within(screen.getByRole('region', { name: 'Letzte 8 Wochen' })).getByRole('table');
  const chest = within(table).getByRole('rowheader', { name: 'Brust' }).closest('tr') as HTMLElement;
  expect(chest.textContent).toContain('4');
  // Triceps get half of the bench sets.
  const tri = within(table).getByRole('rowheader', { name: 'Trizeps' }).closest('tr') as HTMLElement;
  expect(tri.textContent).toContain('2');
});

test('a new person with no sets in the last 4 weeks is not flooded with "Noch nichts"', async () => {
  await show([workout('old', new Date(2026, 8, 1, 18).getTime(), 'pf-bench-press', 'Bankdrücken', 3)]);
  const week = screen.getByRole('region', { name: 'Diese Woche' });
  expect(within(week).queryByText('Noch nichts')).toBeNull();
  expect(within(week).getByText('Diese Woche noch keine Sätze.')).toBeTruthy();
  expect(within(week).queryByRole('button', { name: /Rücken/ })).toBeNull();
  fireEvent.click(within(week).getByRole('button', { name: 'Alle Muskelgruppen anzeigen' }));
  expect(within(week).getByRole('button', { name: /Rücken/ })).toBeTruthy();
  fireEvent.click(within(week).getByRole('button', { name: 'Weniger Muskelgruppen' }));
  expect(within(week).queryByRole('button', { name: /Rücken/ })).toBeNull();
});

test('tapping a row expands the numbers in words; they appear nowhere else in the muscle section', async () => {
  await show([statsRec(statsBody(days)), ...workouts]);
  const week = screen.getByRole('region', { name: 'Diese Woche' });
  const row = within(week).getByRole('button', { name: /Brust/ });
  expect(row.getAttribute('aria-expanded')).toBe('false');
  expect(week.textContent).not.toMatch(/Ziel:|direkt/);
  fireEvent.click(row);
  expect(row.getAttribute('aria-expanded')).toBe('true');
  expect(week.textContent).toContain('Diese Woche: 3 Sätze direkt. Ziel: 12–18 pro Woche.');
  fireEvent.click(row);
  expect(row.getAttribute('aria-expanded')).toBe('false');
  expect(week.textContent).not.toContain('Ziel:');
});

test('indirect work shows "vor allem mittrainiert" and the half-count sentence', async () => {
  // Overhead press works the front delts directly and the triceps indirectly; triceps have more indirect than direct sets.
  await show([workout('w9', new Date(2026, 10, 3, 18).getTime(), 'pf-bench-press', 'Bankdrücken', 4)]);
  const week = screen.getByRole('region', { name: 'Diese Woche' });
  const row = within(week).getByRole('button', { name: /Trizeps/ });
  expect(row.textContent).toContain('vor allem mittrainiert');
  fireEvent.click(row);
  expect(week.textContent).toContain('Diese Woche: 0 Sätze direkt, 4 mittrainiert (zählen halb). Ziel:');
  expect(within(week).getByRole('button', { name: /Brust/ }).textContent).not.toContain('mittrainiert');
});

test('Fortschritt comes first, and the sets table shows the last four weeks', async () => {
  const at = NOW;
  const body = { ...statsBody(days), ftp: [{ atMs: at - 86_400_000, ftpW: 210 }], weightKg: 70 };
  const { port } = fakePort([statsRec(body), ...workouts]);
  render(<StatsScreen port={port} now={now} />);
  const progress = await screen.findByRole('region', { name: 'Fortschritt' });
  const week = screen.getByRole('region', { name: 'Diese Woche' });
  expect(progress.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const table = within(screen.getByRole('region', { name: 'Letzte 8 Wochen' })).getByRole('table');
  expect(table.querySelectorAll('thead th').length).toBe(5); // the muscle column and four weeks
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CoachScreen } from '../../src/tracking/ui/CoachScreen';
import { TodayCard } from '../../src/tracking/ui/TodayCard';
import type { TrackedRecord } from '../../src/shared/records';
import { frameRecord } from '../../src/shared/frame';
import { weekDates } from '../../src/shared/week-plan';
import { fakePort } from './fake-port';

afterEach(cleanup);
const NOW = new Date(2026, 10, 4, 18).getTime(); // Wednesday
const env = { now: () => NOW, newId: () => 'id' };
const plan = (sports: string[]): TrackedRecord => ({ kind: 'weekplan', id: '2026-11-02', updatedMs: 1, deleted: false,
  body: { weekStart: '2026-11-02', fromMessage: 'm', acceptedMs: 1, days: weekDates('2026-11-02').map((date, i) => ({ date, sport: sports[i] ?? 'rest', hardness: 'moderate', fixed: false })) } });
const frames = (m: Map<string, TrackedRecord>) => [...m.values()].filter((r) => r.kind === 'frame');
const frameBody = (m: Map<string, TrackedRecord>) => frames(m)[0]!.body;

test('the mode and minutes selects write the frame, stamped above a stored one', async () => {
  const stored = { ...frameRecord({ mode: 'week', minutes: null }, NOW + 5000), updatedMs: NOW + 9000 };
  const { port, map } = fakePort([stored]);
  render(<CoachScreen port={port} {...env} />);
  fireEvent.change(await screen.findByLabelText('Planung'), { target: { value: 'spontaneous' } });
  await waitFor(() => expect(frameBody(map)).toMatchObject({ mode: 'spontaneous', minutes: null }));
  expect(frames(map)[0]!.updatedMs).toBeGreaterThan(NOW + 9000);
  fireEvent.change(screen.getByLabelText('Zeit pro Einheit'), { target: { value: '45' } });
  await waitFor(() => expect(frameBody(map)).toMatchObject({ mode: 'spontaneous', minutes: 45 }));
});

test('spontaneous mode shows the advice instead of the week', async () => {
  const { port } = fakePort([plan(['gym', 'bike', 'run']), frameRecord({ mode: 'spontaneous', minutes: null }, 1)]);
  render(<CoachScreen port={port} {...env} />);
  expect(await screen.findByRole('heading', { name: /^Heute: / })).toBeTruthy();
  expect(screen.getByText(/^weil /)).toBeTruthy();
  expect(screen.queryByRole('list', { name: 'Wochenplan diese Woche' })).toBeNull();
});

test('"Heute nur" writes frame.today for today only', async () => {
  const { port, map } = fakePort([plan(['gym', 'bike', 'run'])]);
  render(<TodayCard port={port} weekplans={[plan(['gym', 'bike', 'run'])]} runs={[]} nowMs={NOW} gym={null} />);
  fireEvent.change(await screen.findByLabelText('Heute nur'), { target: { value: '30' } });
  await waitFor(() => expect(frameBody(map)).toMatchObject({ mode: 'week', today: { date: '2026-11-04', minutes: 30 } }));
});

test('the start screen without a plan shows the advice with its reason', async () => {
  const { port } = fakePort([]);
  render(<TodayCard port={port} weekplans={[]} runs={[]} nowMs={NOW} gym={null} />);
  expect(await screen.findByRole('heading', { name: /^Heute: / })).toBeTruthy();
  expect(screen.getByText(/^weil /)).toBeTruthy();
  expect(screen.getByLabelText('Heute nur')).toBeTruthy();
});

test('week mode with a plan shows the plan, and the advice only when it differs', async () => {
  const day = (sports: string[]) => [plan(sports)];
  const { port } = fakePort([{ kind: 'workout', id: 'w', updatedMs: 1, deleted: false, body: { id: 'w', title: 'Beine', startMs: NOW - 86_400_000, endMs: NOW - 86_400_000 + 3_600_000, source: 'pandafit', exercises: [{ exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: [] }] } }]);
  render(<TodayCard port={port} weekplans={day(['rest', 'rest', 'gym'])} runs={[]} nowMs={NOW} gym={null} />);
  expect(screen.getByRole('heading').textContent).toBe('Heute: Kraft, mittel');
  expect(await screen.findByText(/^Heute passt: /)).toBeTruthy();
});

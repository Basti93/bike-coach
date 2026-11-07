// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WorkoutScreen } from '../../src/tracking/ui/WorkoutScreen';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import { fakePort } from './fake-port';

afterEach(cleanup);

const rec = (w: LoggedWorkout): TrackedRecord => ({ kind: 'workout', id: w.id, updatedMs: 1, deleted: false, body: w });
const set = (weightKg: number | null, reps: number | null, doneMs: number | null) => ({ type: 'normal' as const, weightKg, reps, durationS: null, doneMs });
const ids = { newId: () => 'new-id', now: () => 100_000 };
const bodyOf = (m: Map<string, TrackedRecord>) => m.get('workout:w1')!.body as LoggedWorkout;
const three = (): LoggedWorkout => ({
  id: 'w1', title: 'Push', startMs: 1000, endMs: null, source: 'pandafit',
  exercises: [
    { exerciseId: 'pf-bench-press', title: 'Bankdrücken', supersetId: null, notes: '', sets: [set(60, 8, 5000), set(60, 8, 6000)] },
    { exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: [set(80, 5, 7000), set(80, 5, null), set(80, 5, null)] },
    { exerciseId: 'pf-deadlift', title: 'Kreuzheben', supersetId: null, notes: '', sets: [set(100, 5, null)] },
  ],
});
async function running(w = three()) {
  const f = fakePort([rec(w)]);
  render(<WorkoutScreen port={f.port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Weitermachen' }));
  await screen.findByRole('region', { name: 'Kniebeuge' });
  return f;
}
const toggle = (title: string) => within(within(screen.getByRole('region', { name: title })).getByRole('heading', { level: 2 })).getByRole('button');

test('only the current exercise is open; the others are one row with their progress', async () => {
  await running();
  expect(screen.getByLabelText('Wiederholungen Satz 2')).toBeTruthy();
  expect(screen.getAllByLabelText('Gewicht Satz 1')).toHaveLength(1); // one exercise shows its sets
  expect(within(screen.getByRole('region', { name: 'Bankdrücken' })).getByText('2 von 2 ✓')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Kreuzheben' })).getByText('0 von 1')).toBeTruthy();
  expect(toggle('Kniebeuge').getAttribute('aria-expanded')).toBe('true');
  expect(toggle('Kreuzheben').getAttribute('aria-expanded')).toBe('false');
});

test('tapping a row opens it and closes the previous one', async () => {
  await running();
  fireEvent.click(toggle('Kreuzheben'));
  expect(toggle('Kreuzheben').getAttribute('aria-expanded')).toBe('true');
  expect(toggle('Kniebeuge').getAttribute('aria-expanded')).toBe('false');
  expect(within(screen.getByRole('region', { name: 'Kreuzheben' })).getByLabelText('Gewicht Satz 1')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Kniebeuge' })).queryByLabelText('Gewicht Satz 1')).toBeNull();
});

test('the open exercise follows the next open set after a confirm', async () => {
  const w = three();
  w.exercises[1]!.sets = [set(80, 5, 7000), set(80, 5, 8000), set(80, 5, null)];
  const f = await running(w);
  fireEvent.click(screen.getByRole('button', { name: 'Satz 3 erledigt' }));
  await waitFor(() => expect(bodyOf(f.map).exercises[1]!.sets[2]!.doneMs).toBe(100_000));
  await waitFor(() => expect(toggle('Kreuzheben').getAttribute('aria-expanded')).toBe('true'));
});

test('the hints sit on the next open set only', async () => {
  await running(); // Kniebeuge: set 1 done, set 2 is next
  const rows = screen.getAllByLabelText(/^Gewicht Satz/).map((i) => i.closest('.tk-set')!);
  expect(rows).toHaveLength(3);
  expect(rows.map((r) => r.querySelector('.tk-hint, .tk-plates') !== null)).toEqual([false, true, false]); // plates for the next set with a weight
});

test('the menu actions reach the same functions: add a set, a note on request, move, edit mode', async () => {
  const f = await running();
  fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Kniebeuge' }));
  fireEvent.click(screen.getByRole('button', { name: 'Satz hinzufügen Kniebeuge' }));
  await waitFor(() => expect(bodyOf(f.map).exercises[1]!.sets).toHaveLength(4));
  expect(screen.queryByRole('list', { name: 'Menü Kniebeuge' })).toBeNull(); // the menu closes after the action
  expect(screen.queryByLabelText('Notiz zu Kniebeuge')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Kniebeuge' }));
  fireEvent.click(screen.getByRole('button', { name: 'Notiz hinzufügen Kniebeuge' }));
  expect(screen.getByLabelText('Notiz zu Kniebeuge')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Kniebeuge' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mehr' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kniebeuge nach unten' }));
  await waitFor(() => expect(bodyOf(f.map).exercises.map((e) => e.title)).toEqual(['Bankdrücken', 'Kreuzheben', 'Kniebeuge']));
});

test('an existing note is shown without asking', async () => {
  const w = three();
  w.exercises[1]!.notes = 'Tiefer gehen';
  await running(w);
  expect((screen.getByLabelText('Notiz zu Kniebeuge') as HTMLTextAreaElement).value).toBe('Tiefer gehen');
});

test('the end sheet: Weglassen is the primary choice, Als erledigt zählen the second, Zurück changes nothing', async () => {
  const f = await running();
  fireEvent.click(screen.getByRole('button', { name: 'Training beenden' }));
  const sheet = await screen.findByRole('dialog', { name: '3 Sätze offen' });
  const buttons = within(sheet).getAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Schließen');
  expect(buttons.map((b) => b.textContent)).toEqual(['Weglassen', 'Als erledigt zählen', 'Zurück']);
  expect(buttons[0]!.className).not.toMatch(/secondary|link/); // the filled one
  expect(buttons[1]!.className).toContain('secondary');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Zurück' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(bodyOf(f.map).endMs).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Training beenden' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Als erledigt zählen' }));
  await waitFor(() => expect(bodyOf(f.map).exercises.flatMap((e) => e.sets).every((s) => s.doneMs !== null)).toBe(true));
  expect(bodyOf(f.map).endMs).not.toBeNull();
});

test('the header menu: discard asks first and then removes the workout; Studio and Coach open from there', async () => {
  const f = await running();
  fireEvent.click(screen.getByRole('button', { name: 'Mehr zum Training' }));
  const menu = screen.getByRole('dialog', { name: 'Training' });
  for (const name of [/^Studio wechseln/, /^Coach fragen/, /^Training beenden/]) expect(within(menu).getByRole('button', { name })).toBeTruthy();
  fireEvent.click(within(menu).getByRole('button', { name: 'Training verwerfen' }));
  expect(f.map.get('workout:w1')!.deleted).toBe(false);
  fireEvent.click(within(menu).getByRole('button', { name: 'Ja' }));
  await waitFor(() => expect(f.map.get('workout:w1')!.deleted).toBe(true));
  expect(await screen.findByRole('heading', { name: 'Training starten' })).toBeTruthy();
});

test('Coach fragen from the header menu opens the coach panel', async () => {
  await running();
  expect(screen.queryByRole('region', { name: 'Coach im Training' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Mehr zum Training' }));
  fireEvent.click(screen.getByRole('button', { name: /^Coach fragen/ }));
  expect(await screen.findByRole('region', { name: 'Coach im Training' })).toBeTruthy();
});

test('the rest bar is one button that skips, with +30 s next to it', async () => {
  const w = { ...three(), rest: { startMs: 70_000, durationS: 90 } };
  const f = await running(w as LoggedWorkout);
  const bar = screen.getByRole('timer', { name: 'Satzpause' });
  expect(bar.textContent).toContain('Pause 1:00');
  fireEvent.click(within(bar).getByRole('button', { name: '+30 s' }));
  await waitFor(() => expect((bodyOf(f.map) as unknown as { rest: { durationS: number } }).rest.durationS).toBe(120));
  fireEvent.click(within(screen.getByRole('timer', { name: 'Satzpause' })).getByRole('button', { name: 'Pause überspringen' }));
  await waitFor(() => expect(screen.queryByRole('timer', { name: 'Satzpause' })).toBeNull());
});

test('the start screen: studio is a row, the others live behind "Anderes Training"', async () => {
  const f = fakePort([]);
  const plan = { name: 'Plan', exercises: [{ templateId: 'pf-squat', title: 'Kniebeuge', restS: null, supersetId: null, notes: '', sets: [{ type: 'normal' as const, weightKg: 60, reps: 8 }] }] };
  render(<WorkoutScreen port={f.port} plan={plan} {...ids} />);
  await screen.findByRole('heading', { name: 'Training starten' });
  expect(screen.queryByRole('button', { name: 'Leeres Training starten' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Anderes Training' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Anderes Training' })).getByRole('button', { name: 'Leeres Training starten' }));
  await waitFor(() => expect(f.state.puts.some((p) => p.kind === 'workout')).toBe(true));
});

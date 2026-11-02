// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WorkoutScreen } from '../../src/tracking/ui/WorkoutScreen';
import { RoutinesScreen } from '../../src/tracking/ui/RoutinesScreen';
import { HistoryScreen } from '../../src/tracking/ui/HistoryScreen';
import { ExercisePicker } from '../../src/tracking/ui/ExercisePicker';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import type { GymWorkout } from '../../src/coach/gym/types';
import { fakePort } from './fake-port';

afterEach(cleanup);

const rec = (w: LoggedWorkout, deleted = false): TrackedRecord => ({ kind: 'workout', id: w.id, updatedMs: 1, deleted, body: w });
const set = (weightKg: number | null, reps: number | null, doneMs: number | null) => ({ type: 'normal' as const, weightKg, reps, durationS: null, doneMs });
const open = (extra: object = {}): LoggedWorkout => ({
  id: 'open1', title: 'Zuhause', startMs: 1000, endMs: null, source: 'pandafit',
  exercises: [{ exerciseId: 'pf-bench-press', title: 'Bankdrücken', supersetId: null, notes: '', sets: [set(62.5, 8, null), set(null, null, null)] }],
  ...extra,
});
const finished = (id = 'f1', endMs = 9000): LoggedWorkout => ({
  id, title: 'Beine', startMs: endMs - 1000, endMs, source: 'pandafit',
  exercises: [{ exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: [set(80, 5, endMs), set(85, 5, endMs)] }],
});
const ids = { newId: () => 'new-id', now: () => 100_000 };
const bodyOf = (m: Map<string, TrackedRecord>, key: string) => m.get(key)!.body as LoggedWorkout;

test('reopening with an open workout offers to continue it', async () => {
  const { port } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  expect(await screen.findByText('Bankdrücken')).toBeTruthy();
});

test('shows 62,5 kg, and accepts comma or dot, with "nach Gefühl" as placeholder only', async () => {
  const { port, map } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  const w1 = (await screen.findByLabelText('Gewicht Satz 1')) as HTMLInputElement;
  expect(w1.value).toBe('62,5');
  const w2 = screen.getByLabelText('Gewicht Satz 2') as HTMLInputElement;
  expect(w2.value).toBe('');
  expect(w2.placeholder).toBe('nach Gefühl');
  fireEvent.change(w2, { target: { value: '40.5' } });
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].sets[1].weightKg).toBe(40.5));
  fireEvent.change(w2, { target: { value: '41,5' } });
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].sets[1].weightKg).toBe(41.5));
  // reps only is valid: confirm set 2 with no reps
  fireEvent.change(w2, { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Wiederholungen Satz 2'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Satz 2 erledigt' }));
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].sets[1]).toMatchObject({ weightKg: null, reps: 12, doneMs: 100_000 }));
});

test('the rest timer survives a reload through its stored start', async () => {
  const w = { ...open(), rest: { startMs: 70_000, durationS: 90 } };
  const { port } = fakePort([rec(w as LoggedWorkout)]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  expect((await screen.findByRole('timer')).textContent).toContain('1:00');
});

test('starting from the plan prefills the range and saves at once', async () => {
  const plan: GymWorkout = { name: 'Plan', exercises: [{ templateId: 'pf-squat', title: 'Kniebeuge', restS: null, supersetId: null, notes: '', sets: [{ type: 'normal', weightKg: null, reps: null, repRange: { start: 8, end: 12 } }] }] };
  const { port, map } = fakePort();
  render(<WorkoutScreen port={port} plan={plan} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: /Plan starten/ }));
  expect(((await screen.findByLabelText('Wiederholungen Satz 1')) as HTMLInputElement).value).toBe('8');
  expect(screen.getByText(/8–12/)).toBeTruthy();
  expect(map.get('workout:new-id')).toBeTruthy();
});

test('finish with open sets asks, and leaving them out keeps them unconfirmed', async () => {
  const { port, map } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Satz 1 erledigt' }));
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].sets[0].doneMs).toBe(100_000));
  fireEvent.click(screen.getByRole('button', { name: 'Training beenden' }));
  expect(await screen.findByRole('button', { name: 'Offene Sätze als erledigt markieren' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Offene Sätze weglassen' }));
  await waitFor(() => expect(bodyOf(map, 'workout:open1').endMs).toBe(100_000));
  expect(bodyOf(map, 'workout:open1').exercises[0].sets[1].doneMs).toBeNull();
});

test('finish without confirmed sets asks first and never deletes silently', async () => {
  const { port, map } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Training beenden' }));
  expect(map.get('workout:open1')!.deleted).toBe(false);
  fireEvent.click(await screen.findByRole('button', { name: 'Weiter trainieren' }));
  expect(map.get('workout:open1')!.deleted).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Training beenden' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Training verwerfen' }));
  await waitFor(() => expect(map.get('workout:open1')!.deleted).toBe(true)); // tombstone, record still there
});

test('a failing save shows a calm message, keeps the set, and the next action saves it', async () => {
  const { port, map, state } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  state.failPuts = true;
  fireEvent.click(await screen.findByRole('button', { name: 'Satz 1 erledigt' }));
  expect((await screen.findByRole('status')).textContent).toMatch(/nicht gespeichert/);
  state.failPuts = false;
  fireEvent.click(screen.getByRole('button', { name: 'Satz 2 erledigt' }));
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(bodyOf(map, 'workout:open1').exercises[0].sets.map((s) => s.doneMs)).toEqual([100_000, 100_000]);
});

test('an exercise can be swapped from the workout screen', async () => {
  const { port, map } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Bankdrücken tauschen' }));
  fireEvent.click(await screen.findByRole('button', { name: /Brustpresse/ }));
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises.map((e) => e.exerciseId)).toEqual(['pf-chest-press-machine']));
});

test('past workouts can be edited and deleted', async () => {
  const { port, map } = fakePort([rec(finished())]);
  render(<HistoryScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: /Beine/ }));
  fireEvent.change(await screen.findByLabelText('Gewicht Satz 1'), { target: { value: '82,5' } });
  await waitFor(() => expect(bodyOf(map, 'workout:f1').exercises[0].sets[0].weightKg).toBe(82.5));
  fireEvent.click(screen.getByRole('button', { name: 'Training löschen' }));
  expect(map.get('workout:f1')!.deleted).toBe(false);
  fireEvent.click(await screen.findByRole('button', { name: 'Ja, löschen' }));
  await waitFor(() => expect(map.get('workout:f1')!.deleted).toBe(true));
});

test('history shows progress per exercise', async () => {
  const { port } = fakePort([rec(finished('a', 5000)), rec(finished('b', 9000))]);
  render(<HistoryScreen port={port} {...ids} />);
  fireEvent.click((await screen.findAllByRole('button', { name: /Beine/ }))[0]);
  fireEvent.click(await screen.findByRole('button', { name: 'Verlauf Kniebeuge' }));
  expect(await screen.findAllByText(/85 kg/)).not.toHaveLength(0);
});

test('a routine can be created, edited and started', async () => {
  const { port, map } = fakePort();
  const onStart = vi.fn();
  render(<RoutinesScreen port={port} onStart={onStart} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Neue Routine' }));
  fireEvent.change(screen.getByLabelText('Name der Routine'), { target: { value: 'Push' } });
  fireEvent.click(screen.getByRole('button', { name: 'Übung hinzufügen' }));
  fireEvent.click(await screen.findByRole('button', { name: "Bankdrücken" }));
  fireEvent.click(screen.getByRole('button', { name: 'Routine speichern' }));
  await waitFor(() => expect(map.get('routine:new-id')).toBeTruthy());
  expect((map.get('routine:new-id')!.body as GymWorkout).name).toBe('Push');
  fireEvent.click(await screen.findByRole('button', { name: 'Push bearbeiten' }));
  fireEvent.change(screen.getByLabelText('Name der Routine'), { target: { value: 'Push A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Routine speichern' }));
  await waitFor(() => expect((map.get('routine:new-id')!.body as GymWorkout).name).toBe('Push A'));
  fireEvent.click(await screen.findByRole('button', { name: 'Push A starten' }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ name: 'Push A' }));
});

test('custom exercises can be added', async () => {
  const { port, map } = fakePort();
  const onPick = vi.fn();
  render(<ExercisePicker port={port} onPick={onPick} onClose={() => {}} {...ids} />);
  // grouped and searchable
  expect(screen.getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(3);
  fireEvent.change(screen.getByLabelText('Suchen'), { target: { value: 'kniebeuge' } });
  expect(screen.getAllByRole('button', { name: /Kniebeuge/ }).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Eigene Übung anlegen' }));
  const save = screen.getByRole('button', { name: 'Übung speichern' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tire Flip' } });
  fireEvent.change(screen.getByLabelText('Muskelgruppe'), { target: { value: 'quadriceps' } });
  fireEvent.change(screen.getByLabelText('Equipment'), { target: { value: 'other' } });
  fireEvent.change(screen.getByLabelText('Art'), { target: { value: 'duration' } });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() => expect(map.get('exercise:new-id')).toBeTruthy());
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-id', title: 'Tire Flip', type: 'duration' }));
});

test('own exercises show up in the picker, timed ones get a seconds field', async () => {
  const own = { id: 'own-1', title: 'Plank Eigen', type: 'duration', primaryMuscle: 'abdominals', equipment: 'none' };
  const w = { ...open(), exercises: [{ exerciseId: 'own-1', title: 'Plank Eigen', supersetId: null, notes: '', timed: true, sets: [set(null, null, null)] }] };
  const { port } = fakePort([{ kind: 'exercise', id: 'own-1', updatedMs: 1, deleted: false, body: own }, rec(w as unknown as LoggedWorkout)]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  expect(await screen.findByLabelText('Sekunden Satz 1')).toBeTruthy();
  expect(screen.queryByLabelText('Wiederholungen Satz 1')).toBeNull();
});

test('shows calmly that a finished workout is not on the server yet', async () => {
  const { port, state } = fakePort([rec(finished())]);
  state.pending = 1;
  render(<HistoryScreen port={port} {...ids} />);
  const note = await screen.findByRole('status');
  expect(note.textContent).toMatch(/noch nicht auf dem Server/i);
  expect(note.textContent).toMatch(/sicher/);
  within(note); // calm text, no alarm role
  expect(screen.queryByRole('alert')).toBeNull();
});

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

test('shows 62,5 kg, and accepts comma or dot, with a short placeholder only', async () => {
  const { port, map } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  const w1 = (await screen.findByLabelText('Gewicht Satz 1')) as HTMLInputElement;
  expect(w1.value).toBe('62,5');
  const w2 = screen.getByLabelText('Gewicht Satz 2') as HTMLInputElement;
  expect(w2.value).toBe('');
  expect(w2.placeholder).toBe('–');
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
  fireEvent.click(await screen.findByRole('button', { name: 'Mehr zu Bankdrücken' }));
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

// ---- fix round ----
const twoEx = (): LoggedWorkout => open({ exercises: [
  { exerciseId: 'pf-bench-press', title: 'Bankdrücken', supersetId: null, notes: '', sets: [set(60, 8, null), set(60, 8, null)] },
  { exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: [set(80, 5, null)] },
] });
const resume = async () => fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));

test('a double tap on remove never removes the next row', async () => {
  const { port, map } = fakePort([rec(twoEx())]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  const btn = (await screen.findAllByRole('button', { name: 'Satz 1 entfernen' }))[0];
  fireEvent.click(btn); fireEvent.click(btn);
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].sets).toHaveLength(1));
  fireEvent.click(await screen.findByRole('button', { name: 'Mehr zu Bankdrücken' }));
  const ex = await screen.findByRole('button', { name: 'Bankdrücken entfernen' });
  fireEvent.click(ex); fireEvent.click(ex);
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises.map((e) => e.title)).toEqual(['Kniebeuge']));
});

test('removing a confirmed set asks first, an unconfirmed one does not', async () => {
  const w = open({ exercises: [{ exerciseId: 'a', title: 'Bankdrücken', supersetId: null, notes: '', sets: [set(60, 8, 500), set(60, 8, null)] }] });
  const { port, map } = fakePort([rec(w)]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  fireEvent.click(await screen.findByRole('button', { name: 'Satz 2 entfernen' }));
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].sets).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Satz 1 entfernen' }));
  expect(bodyOf(map, 'workout:open1').exercises[0].sets).toHaveLength(1);
  fireEvent.click(await screen.findByRole('button', { name: 'Ja, entfernen' }));
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].sets).toHaveLength(0));
});

test('typing with slow saves keeps every digit, also while earlier saves land', async () => {
  const { port, state } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  const f = (await screen.findByLabelText('Gewicht Satz 2')) as HTMLInputElement;
  state.delayMs = 40;
  fireEvent.focus(f);
  for (const v of ['6', '62', '625']) fireEvent.change(f, { target: { value: v } });
  await new Promise((r) => setTimeout(r, 60)); // the first save has landed, the others are still pending
  expect(state.puts.length).toBeGreaterThan(0);
  expect(f.value).toBe('625');
  await new Promise((r) => setTimeout(r, 200));
  expect(f.value).toBe('625');
});

test('unreadable text shows calmly as invalid and blocks confirming; reps are not rounded', async () => {
  const { port, map } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  const w = await screen.findByLabelText('Gewicht Satz 2');
  const ok = screen.getByRole('button', { name: 'Satz 2 erledigt' }) as HTMLButtonElement;
  fireEvent.change(w, { target: { value: 'abc' } });
  expect(w.getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText('Bitte eine Zahl')).toBeTruthy();
  expect(ok.disabled).toBe(true);
  fireEvent.change(w, { target: { value: '20' } });
  expect(ok.disabled).toBe(false);
  const reps = screen.getByLabelText('Wiederholungen Satz 2');
  fireEvent.change(reps, { target: { value: '8,5' } });
  expect(screen.getByText('Bitte eine ganze Zahl')).toBeTruthy();
  await new Promise((r) => setTimeout(r, 20));
  expect(bodyOf(map, 'workout:open1').exercises[0].sets[1].reps).not.toBe(9);
  expect(bodyOf(map, 'workout:open1').exercises[0].sets[1].reps).not.toBe(8.5);
});

test('notes keep what is typed and save after a short pause and on blur', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { port, map } = fakePort([rec(open())]);
    render(<WorkoutScreen port={port} {...ids} />);
    await resume();
    const n = (await screen.findByLabelText('Notiz zu Bankdrücken')) as HTMLInputElement;
    fireEvent.focus(n);
    for (const v of ['S', 'Sc', 'Sch']) fireEvent.change(n, { target: { value: v } });
    expect(n.value).toBe('Sch');
    await vi.advanceTimersByTimeAsync(500);
    await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].notes).toBe('Sch'));
    expect(n.value).toBe('Sch');
    fireEvent.change(n, { target: { value: 'Schulter' } });
    fireEvent.blur(n);
    await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].notes).toBe('Schulter'));
  } finally { vi.useRealTimers(); }
});

test('a note typed right before finishing is in the finished record', async () => {
  const w = open();
  w.exercises[0].sets = [set(60, 5, 1000)];
  const { port, state } = fakePort([rec(w)]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  const n = (await screen.findByLabelText('Notiz zu Bankdrücken')) as HTMLInputElement;
  fireEvent.focus(n);
  fireEvent.change(n, { target: { value: 'Schluss' } });
  fireEvent.click(screen.getByRole('button', { name: 'Training beenden' }));
  await waitFor(() => expect(state.puts.some((p) => (p.body as LoggedWorkout).endMs !== null)).toBe(true));
  const final = state.puts.filter((p) => (p.body as LoggedWorkout).endMs !== null).at(-1)!.body as LoggedWorkout;
  expect(final.exercises[0].notes).toBe('Schluss');
});

test('nothing confirmed also offers to mark all sets done', async () => {
  const { port, map } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  fireEvent.click(await screen.findByRole('button', { name: 'Training beenden' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Alle Sätze als erledigt markieren' }));
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].sets.every((s) => s.doneMs !== null)).toBe(true));
});

test('an old open workout shows its date and can be continued, ended or discarded; others are listed too', async () => {
  const older = { ...open({ id: 'old', title: 'Gestern', startMs: 5000 }) };
  const { port, map } = fakePort([rec(open({ startMs: 90_000 })), rec(older)]);
  render(<WorkoutScreen port={port} {...ids} />);
  expect(await screen.findByRole('button', { name: 'Training fortsetzen' })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /Training verwerfen/ })).toHaveLength(2);
  expect(screen.getAllByText(/gestartet/).length).toBe(2); // both visible
  fireEvent.click(screen.getByRole('button', { name: /Training verwerfen Gestern/ }));
  expect(map.get('workout:old')!.deleted).toBe(false);
  fireEvent.click(await screen.findByRole('button', { name: 'Ja, verwerfen' }));
  await waitFor(() => expect(map.get('workout:old')!.deleted).toBe(true));
});

test('ending an old open workout from the list asks the finish question', async () => {
  const { port } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training beenden' }));
  expect(await screen.findByRole('button', { name: 'Training verwerfen' })).toBeTruthy(); // nothing confirmed question
});

test('a double tap on start creates only one workout', async () => {
  const { port, state } = fakePort();
  let n = 0;
  render(<WorkoutScreen port={port} now={() => 100_000} newId={() => `id${++n}`} />);
  const b = await screen.findByRole('button', { name: 'Leeres Training starten' });
  fireEvent.click(b); fireEvent.click(b);
  await screen.findByText('Training');
  expect(state.puts.filter((p) => p.kind === 'workout').map((p) => p.id)).toEqual(['id1']);
});

test('a copy finished on another device is announced, not reopened', async () => {
  const { port, map, notify } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  await screen.findByLabelText('Gewicht Satz 1');
  map.set('workout:open1', { ...rec(open({ endMs: 99_999 })), updatedMs: 5_000_000 });
  notify();
  expect((await screen.findByRole('status')).textContent).toMatch(/anderen Gerät beendet/);
  expect(screen.queryByRole('button', { name: 'Training fortsetzen' })).toBeNull();
});

test('a newer remote copy of an open workout is continued from', async () => {
  const { port, map, notify } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  await screen.findByLabelText('Gewicht Satz 1');
  const remote = open({ exercises: [{ exerciseId: 'pf-bench-press', title: 'Bankdrücken', supersetId: null, notes: '', sets: [set(99, 8, null)] }] });
  map.set('workout:open1', { ...rec(remote), updatedMs: 5_000_000 });
  notify();
  await waitFor(() => expect((screen.getByLabelText('Gewicht Satz 1') as HTMLInputElement).value).toBe('99'));
});

test('a failed first read shows a calm message with a retry, not the start screen', async () => {
  const { port, state } = fakePort([rec(open())]);
  state.failList = true;
  render(<WorkoutScreen port={port} {...ids} />);
  expect((await screen.findByRole('status')).textContent).toMatch(/nicht gelesen/);
  expect(screen.queryByRole('button', { name: 'Leeres Training starten' })).toBeNull();
  state.failList = false;
  fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }));
  expect(await screen.findByRole('button', { name: 'Training fortsetzen' })).toBeTruthy();
});

test('WorkoutScreen starts a given routine', async () => {
  const routine: GymWorkout = { name: 'Push', exercises: [{ templateId: 'pf-bench-press', title: 'Bankdrücken', restS: null, supersetId: null, notes: '', sets: [{ type: 'normal', weightKg: null, reps: null }] }] };
  const { port } = fakePort();
  render(<WorkoutScreen port={port} routine={routine} {...ids} />);
  expect(await screen.findByText('Bankdrücken')).toBeTruthy();
  expect(screen.getByText('Push')).toBeTruthy();
});

test('history has a per-exercise view with last values and progress', async () => {
  const { port } = fakePort([rec(finished('a', 5000)), rec(finished('b', 9000))]);
  render(<HistoryScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Übungen' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Kniebeuge' }));
  expect(await screen.findByText('Zuletzt')).toBeTruthy();
  expect(screen.getAllByText(/85 kg × 5/).length).toBeGreaterThan(0);
});

test('a Hevy copy of an own session is listed once in the history', async () => {
  const own = finished('own', 9000);
  const hv = { ...finished('hv', 9500), source: 'hevy' as const, title: 'Hevy-Beine' };
  const { port } = fakePort([rec(own), rec(hv)]);
  render(<HistoryScreen port={port} {...ids} />);
  await screen.findByRole('button', { name: /Beine/ });
  expect(screen.queryByRole('button', { name: /Hevy-Beine/ })).toBeNull();
});

// ---- fix round 2 ----
test('a failed first save with a list that lacks the record keeps the screen open and retrying', async () => {
  const { port, map, state } = fakePort();
  state.failPuts = true;
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Leeres Training starten' }));
  expect((await screen.findByRole('status')).textContent).toMatch(/nicht gespeichert/);
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.getByRole('button', { name: 'Training beenden' })).toBeTruthy(); // not stepped aside
  state.failPuts = false;
  fireEvent.click(screen.getByRole('button', { name: 'Jetzt nochmal speichern' }));
  await waitFor(() => expect(map.get('workout:new-id')).toBeTruthy());
});

test('a delete from elsewhere on a clean screen mentions the copy when one was kept', async () => {
  const { port, map, notify } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  await screen.findByRole('button', { name: 'Training beenden' });
  const copy = { ...finished('open1-kopie-1'), keptCopyOf: 'open1' };
  map.set('workout:open1-kopie-1', rec(copy));
  map.set('workout:open1', { ...rec(open()), deleted: true, updatedMs: 5_000_000 });
  notify();
  expect((await screen.findByRole('status')).textContent).toMatch(/gelöscht.*Die Fassung mit mehr Sätzen liegt als Kopie im Verlauf\./);
});

async function dirtyOpen() {
  const h = fakePort([rec(open())]);
  render(<WorkoutScreen port={h.port} {...ids} />);
  await resume();
  h.state.failPuts = true;
  fireEvent.click(await screen.findByRole('button', { name: 'Satz 1 erledigt' }));
  await screen.findByRole('status');
  return h;
}

test('a tombstone from elsewhere with unsaved work here: stay open, say so, and the next write wins', async () => {
  const { port, map, state, notify } = await dirtyOpen();
  map.set('workout:open1', { ...rec(open()), deleted: true, updatedMs: 5_000_000 });
  notify();
  expect((await screen.findByRole('note')).textContent).toMatch(/anderen Gerät/);
  expect(screen.getByLabelText('Gewicht Satz 1')).toBeTruthy();
  state.failPuts = false;
  fireEvent.click(screen.getByRole('button', { name: 'Jetzt nochmal speichern' }));
  await waitFor(() => expect(map.get('workout:open1')!.deleted).toBe(false));
  expect(map.get('workout:open1')!.updatedMs).toBeGreaterThan(5_000_000);
  expect(bodyOf(map, 'workout:open1').exercises[0].sets[0].doneMs).toBe(100_000);
});

test('a remote finish with unsaved work here: stay open and keep writing', async () => {
  const { port, map, state, notify } = await dirtyOpen();
  map.set('workout:open1', { ...rec(open({ endMs: 99_999 })), updatedMs: 5_000_000 });
  notify();
  expect((await screen.findByRole('note')).textContent).toMatch(/beendet/);
  state.failPuts = false;
  fireEvent.click(screen.getByRole('button', { name: 'Jetzt nochmal speichern' }));
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].sets[0].doneMs).toBe(100_000));
  expect(map.get('workout:open1')!.updatedMs).toBeGreaterThan(5_000_000);
});

test('a failed discard from the open-workout card does not retry; the workout can be resumed', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { port, map, state } = fakePort([rec(open())]);
    render(<WorkoutScreen port={port} {...ids} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Training verwerfen' }));
    state.failPuts = true;
    fireEvent.click(await screen.findByRole('button', { name: 'Ja, verwerfen' }));
    await screen.findByRole('status');
    state.failPuts = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(map.get('workout:open1')!.deleted).toBe(false);
    expect(state.puts.some((p) => p.deleted)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Training fortsetzen' }));
    expect(await screen.findByLabelText('Gewicht Satz 1')).toBeTruthy();
  } finally { vi.useRealTimers(); }
});

test('leaving the screen with an unsaved set keeps retrying in the background', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { port, map, state } = fakePort([rec(open())]);
    const view = render(<WorkoutScreen port={port} {...ids} />);
    await resume();
    state.failPuts = true;
    fireEvent.click(await screen.findByRole('button', { name: 'Satz 1 erledigt' }));
    await screen.findByRole('status');
    view.unmount();
    state.failPuts = false;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(bodyOf(map, 'workout:open1').exercises[0].sets[0].doneMs).toBe(100_000);
  } finally { vi.useRealTimers(); }
});

test('removing a set asks when it is confirmed in the newest state, even if the display lags', async () => {
  const { port, map, state } = fakePort([rec(open())]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  let release!: () => void; state.gate = new Promise<void>((r) => { release = r; });
  fireEvent.click(await screen.findByRole('button', { name: 'Satz 1 erledigt' })); // display not updated until put answers
  fireEvent.click(screen.getByRole('button', { name: 'Satz 1 entfernen' }));
  expect(await screen.findByRole('button', { name: 'Ja, entfernen' })).toBeTruthy();
  state.gate = null; release();
  await waitFor(() => expect(bodyOf(map, 'workout:open1').exercises[0].sets).toHaveLength(2));
});

test('after a failed finish, a successful retry leaves the screen', async () => {
  const w = open({ exercises: [{ exerciseId: 'a', title: 'Bankdrücken', supersetId: null, notes: '', sets: [set(60, 8, 500), set(60, 8, null)] }] });
  const { port, map, state } = fakePort([rec(w)]);
  render(<WorkoutScreen port={port} {...ids} />);
  await resume();
  fireEvent.click(await screen.findByRole('button', { name: 'Training beenden' }));
  state.failPuts = true;
  fireEvent.click(await screen.findByRole('button', { name: 'Offene Sätze weglassen' }));
  await screen.findByRole('status');
  state.failPuts = false;
  fireEvent.click(screen.getByRole('button', { name: 'Jetzt nochmal speichern' }));
  expect(await screen.findByRole('heading', { name: 'Training starten' })).toBeTruthy();
  expect(bodyOf(map, 'workout:open1').endMs).not.toBeNull();
});

test('a double tap on saving a routine makes one routine with one id per draft', async () => {
  const { port, state } = fakePort();
  let n = 0;
  render(<RoutinesScreen port={port} onStart={() => {}} now={() => 100_000} newId={() => `r${++n}`} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Neue Routine' }));
  fireEvent.change(screen.getByLabelText('Name der Routine'), { target: { value: 'Push' } });
  const save = screen.getByRole('button', { name: 'Routine speichern' });
  fireEvent.click(save); fireEvent.click(save);
  await screen.findByRole('button', { name: 'Push starten' });
  expect(state.puts.filter((p) => p.kind === 'routine').map((p) => p.id)).toEqual(['r1']);
});

test('the workout rows: headers, chips, one grid, a clear done box and last time as a hint', async () => {
  const w = open({ exercises: [{ exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: [{ ...set(20, 10, null), type: 'warmup' }, set(40, 8, null), { ...set(40, 6, null), type: 'failure' }] }] });
  const { port } = fakePort([rec(w), rec(finished())]);
  const { container } = render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  await screen.findByLabelText('Gewicht Satz 1');
  const head = container.querySelector('.tk-head')!;
  expect(head.textContent).toBe('SatzkgWdh');
  const rows = [...container.querySelectorAll('.tk-set:not(.tk-head)')];
  expect(rows.map((r) => r.querySelector('.tk-chip')!.textContent)).toEqual(['A', '1', 'F']);
  // every row and the header have the same five cells, whatever the set type
  for (const r of [head, ...rows]) expect([...r.children].filter((c) => !c.matches('.tk-hint, .tk-wide')).length).toBe(5);
  // full names in the choice
  expect([...(screen.getByLabelText('Satztyp Satz 1') as HTMLSelectElement).options].map((o) => o.text)).toEqual(['Aufwärmen', 'Normaler Satz', 'Bis zum Versagen', 'Dropset']);
  // last time: the finished session had 80 × 5 and 85 × 5 as working sets
  expect(screen.getByText('zuletzt 80 kg × 5')).toBeTruthy();
  expect(screen.getByText('zuletzt 85 kg × 5')).toBeTruthy();
  const check = screen.getByRole('button', { name: 'Satz 2 erledigt' });
  expect(check.textContent).toBe('✓');
  expect(check.getAttribute('aria-pressed')).toBe('false');
  // swap and remove live behind one menu
  expect(screen.queryByRole('button', { name: 'Kniebeuge tauschen' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Kniebeuge' }));
  expect(screen.getByRole('button', { name: 'Kniebeuge tauschen' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Kniebeuge entfernen' })).toBeTruthy();
  // the note is a growing text field
  expect(screen.getByLabelText('Notiz zu Kniebeuge').tagName).toBe('TEXTAREA');
});

test('a plan without weights says "Gewicht nach Gefühl" once, under the title', async () => {
  const plan: GymWorkout = { name: 'Plan', exercises: [{ templateId: 'pf-leg-press', title: 'Beinpresse', restS: null, supersetId: null, notes: '', sets: [{ type: 'normal', weightKg: null, reps: 10 }, { type: 'normal', weightKg: null, reps: 10 }] }] };
  const { port } = fakePort();
  render(<WorkoutScreen port={port} plan={plan} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: /Plan starten/ }));
  expect(await screen.findAllByText('Gewicht nach Gefühl')).toHaveLength(1);
  expect((screen.getByLabelText('Gewicht Satz 1') as HTMLInputElement).placeholder).toBe('–');
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import { ExercisePicker } from '../../src/tracking/ui/ExercisePicker';
import { WorkoutScreen } from '../../src/tracking/ui/WorkoutScreen';
import { fakePort } from './fake-port';

afterEach(cleanup);

const set = { type: 'normal' as const, weightKg: 60, reps: 8, durationS: null, doneMs: null };
const ex = (exerciseId: string, title: string) => ({ exerciseId, title, supersetId: null, notes: '', sets: [set] });
const open: LoggedWorkout = {
  id: 'o1', title: 'Zuhause', startMs: 1000, endMs: null, source: 'pandafit',
  exercises: [ex('pf-squat', 'Kniebeuge'), ex('pf-front-squat', 'Frontkniebeuge'), ex('my-own-uuid', 'Meine Übung')],
};
const rec = (w: LoggedWorkout): TrackedRecord => ({ kind: 'workout', id: w.id, updatedMs: 1, deleted: false, body: w });
const ids = { newId: () => 'new-id', now: () => 100_000 };

async function running() {
  const { port } = fakePort([rec(open)]);
  render(<WorkoutScreen port={port} {...ids} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
  await screen.findByText('Kniebeuge');
}

describe('workout: Ausführung in the exercise menu', () => {
  test('collapsed by default; the menu entry opens it with the wger credit, and hides it again', async () => {
    await running();
    expect(screen.queryByText(/Füße etwas mehr als hüftbreit/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Kniebeuge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ausführung Kniebeuge' }));
    const note = screen.getByRole('note', { name: 'Ausführung Kniebeuge' });
    expect(note.textContent).toMatch(/Füße etwas mehr als hüftbreit/);
    expect(note.textContent).toContain('Quelle: wger.de, wger.de, CC-BY-SA 3.0');
    expect(screen.queryByRole('button', { name: 'Kniebeuge tauschen' })).toBeNull(); // the menu closed
    fireEvent.click(screen.getByRole('button', { name: 'Ausführung ausblenden' }));
    expect(screen.queryByRole('note', { name: 'Ausführung Kniebeuge' })).toBeNull();
  });

  test('the menu entry toggles: a second tap hides it', async () => {
    await running();
    fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Kniebeuge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ausführung Kniebeuge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Kniebeuge' }));
    const entry = screen.getByRole('button', { name: 'Ausführung Kniebeuge' });
    expect(entry.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(entry);
    expect(screen.queryByRole('note', { name: 'Ausführung Kniebeuge' })).toBeNull();
  });

  test('an own text shows without a credit line', async () => {
    await running();
    fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Frontkniebeuge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ausführung Frontkniebeuge' }));
    const note = screen.getByRole('note', { name: 'Ausführung Frontkniebeuge' });
    expect(note.textContent).toMatch(/Ellbogen/);
    expect(note.textContent).not.toContain('Quelle');
  });

  test('an exercise without a description has no Ausführung entry', async () => {
    await running();
    fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Meine Übung' }));
    expect(screen.getByRole('button', { name: 'Meine Übung tauschen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ausführung Meine Übung' })).toBeNull();
  });
});

describe('picker: info toggle per exercise', () => {
  const mine: TrackedRecord = { kind: 'exercise', id: 'mine-1', updatedMs: 1, deleted: false, body: { id: 'mine-1', title: 'Seilspringen am Hof', type: 'reps_only', primaryMuscle: 'cardio', equipment: 'none' } };

  test('the i toggle shows and hides the text inline without picking, credit included', async () => {
    const { port } = fakePort();
    const onPick = vi.fn();
    render(<ExercisePicker port={port} onPick={onPick} onClose={() => {}} />);
    const info = await screen.findByRole('button', { name: 'Ausführung Bankdrücken' });
    expect(info.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('note', { name: 'Ausführung Bankdrücken' })).toBeNull();
    fireEvent.click(info);
    expect(onPick).not.toHaveBeenCalled();
    expect(info.getAttribute('aria-expanded')).toBe('true');
    const note = screen.getByRole('note', { name: 'Ausführung Bankdrücken' });
    expect(note.textContent).toMatch(/Lege dich auf die Bank/);
    expect(note.textContent).toContain('Quelle: wger.de, sistab2, CC-BY-SA 3.0');
    fireEvent.click(info);
    expect(screen.queryByRole('note', { name: 'Ausführung Bankdrücken' })).toBeNull();
  });

  test('picking still works with the row, and own exercises have no toggle', async () => {
    const { port } = fakePort([mine]);
    const onPick = vi.fn();
    render(<ExercisePicker port={port} onPick={onPick} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Suchen'), { target: { value: 'Seilspringen' } });
    const row = await screen.findByRole('button', { name: /Seilspringen am Hof/ });
    expect(screen.queryByRole('button', { name: 'Ausführung Seilspringen am Hof' })).toBeNull();
    fireEvent.click(row);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'mine-1' }));
  });
});

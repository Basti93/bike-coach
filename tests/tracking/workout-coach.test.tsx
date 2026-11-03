// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkoutCoach } from '../../src/tracking/ui/WorkoutCoach';
import { EXERCISES } from '../../src/shared/exercises';
import type { TrackedRecord } from '../../src/shared/records';
import type { TrackedWorkout } from '../../src/tracking/session';
import { fakePort } from './fake-port';

afterEach(cleanup);
const NOW = 1_000_000;
let n = 0;
const props = { catalog: EXERCISES, now: () => NOW, newId: () => `id${++n}` };
const w: TrackedWorkout = { id: 'w1', title: 'Oberkörper', startMs: NOW - 600_000, endMs: null, source: 'pandafit', rest: null, exercises: [
  { rid: 'e1', exerciseId: 'pf-bench-press', title: 'Bankdrücken', supersetId: null, notes: '', sets: [{ rid: 's1', type: 'normal', weightKg: 60, reps: 8, durationS: null, doneMs: null }] },
] };
const chat = (id: string, body: object): TrackedRecord => ({ kind: 'chat', id, updatedMs: 1, deleted: false, body: { atMs: NOW - 1000, ...body } });
const all = (m: Map<string, TrackedRecord>) => [...m.values()].map((r) => r.body as Record<string, unknown>);

test('closed until asked; a message is sent for this workout and the coach is shown as thinking', async () => {
  const { port, map } = fakePort();
  render(<WorkoutCoach port={port} workout={w} {...props} onApply={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Coach fragen' }));
  fireEvent.change(screen.getByLabelText('Nachricht an den Coach im Training'), { target: { value: 'Bank belegt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
  await waitFor(() => expect(all(map)).toEqual([{ role: 'rider', text: 'Bank belegt', atMs: NOW, inWorkout: 'w1' }]));
  expect(await screen.findByRole('status')).toBeTruthy();
});

test('a proposal opens the panel by itself, reads in plain words, and applies only on Übernehmen', async () => {
  const { port, map } = fakePort([
    chat('r1', { role: 'rider', text: 'Bank belegt', inWorkout: 'w1' }),
    chat('c1', { role: 'coach', text: 'Dann Brustpresse.', replyTo: 'r1', inWorkout: 'w1', workoutChange: { workoutId: 'w1', ops: [{ op: 'swap', ex: 'e1', to: 'pf-chest-press-machine' }] } }),
  ]);
  const applied: unknown[] = [];
  render(<WorkoutCoach port={port} workout={w} {...props} onApply={(c) => applied.push(c)} />);
  expect(await screen.findByText('Bankdrücken tauschen gegen Brustpresse')).toBeTruthy();
  expect(applied).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
  expect(applied).toHaveLength(1);
  await waitFor(() => expect(all(map).some((b) => b.takes === 'c1')).toBe(true));
  expect(await screen.findByText('Übernommen.')).toBeTruthy();
});

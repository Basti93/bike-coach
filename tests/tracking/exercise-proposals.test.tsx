// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { mergeCatalog } from '../../src/shared/catalog';
import { EXERCISES } from '../../src/shared/exercises';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import { changeProposal, confirmProposal, undoAutoLink } from '../../src/tracking/exercise-proposals';
import { ExerciseProposals } from '../../src/tracking/ui/ExerciseProposals';
import { WorkoutScreen } from '../../src/tracking/ui/WorkoutScreen';
import { fakePort } from './fake-port';

afterEach(cleanup);

const NOW = Date.UTC(2026, 10, 6, 12);
const DAY = 86_400_000;
const TITLE = 'Cable Row Custom';
const cat = (records: TrackedRecord[] = []) => mergeCatalog(EXERCISES, [], records);
const sameProposal: TrackedRecord = { kind: 'exercise', id: 'prop-1', updatedMs: NOW - 1000, deleted: false, body: { id: 'prop-1', proposal: { forTitle: TITLE, kind: 'same', targetId: 'pf-squat', reason: 'Gleiche Übung.', atMs: NOW - 1000 } } };
const newProposal: TrackedRecord = { kind: 'exercise', id: 'prop-2', updatedMs: NOW - 1000, deleted: false, body: { id: 'prop-2', title: 'Zorbo-Zug', type: 'weight_reps', primaryMuscle: 'lats', equipment: 'machine', source: 'ai', description: 'Ruhig ziehen.', proposal: { forTitle: 'Zorbo Pull', kind: 'new', reason: 'Neu.', atMs: NOW - 1000 } } };
const linked = (atMs = NOW - DAY, extra: object = {}): TrackedRecord => ({ kind: 'exercise', id: 'pf-squat', updatedMs: atMs, deleted: false, body: { id: 'pf-squat', aliases: ['Cable Curl'], lastAutoLink: { title: 'Cable Curl', atMs }, ...extra } });

describe('pure actions', () => {
  test('confirm same: alias on the target, proposal deleted, existing overlay fields kept', () => {
    const have: TrackedRecord = { kind: 'exercise', id: 'pf-squat', updatedMs: NOW + 5, deleted: false, body: { id: 'pf-squat', aliases: ['Old'], description: 'Mein Text.' } };
    const [overlay, gone] = confirmProposal(sameProposal, cat(), NOW, [have, sameProposal]);
    expect(overlay).toMatchObject({ id: 'pf-squat', deleted: false, updatedMs: NOW + 6, body: { aliases: ['Old', TITLE], description: 'Mein Text.' } });
    expect(gone).toMatchObject({ id: 'prop-1', deleted: true });
    expect(gone!.updatedMs).toBeGreaterThan(sameProposal.updatedMs);
    expect(cat([overlay!]).find((e) => e.id === 'pf-squat')?.aliases).toContain(TITLE);
  });

  test('confirm same without a target in the catalog writes nothing', () => {
    expect(confirmProposal({ ...sameProposal, body: { proposal: { forTitle: TITLE, kind: 'same', targetId: 'nope', reason: '', atMs: 1 } } }, cat(), NOW)).toEqual([]);
  });

  test('confirm new: the proposal record becomes the exercise, by ai, and knows the logged title', () => {
    const [ex, ...rest] = confirmProposal(newProposal, cat(), NOW);
    expect(rest).toEqual([]);
    expect(ex!.id).toBe('prop-2');
    expect(ex!.deleted).toBe(false);
    expect((ex!.body as Record<string, unknown>).proposal).toBeUndefined();
    expect(ex!.body).toMatchObject({ source: 'ai', title: 'Zorbo-Zug', aliases: ['Zorbo Pull'] });
    expect(cat([ex!]).find((e) => e.id === 'prop-2')).toMatchObject({ title: 'Zorbo-Zug', source: 'ai' });
  });

  test('change: links to the chosen target', () => {
    const [overlay, gone] = changeProposal(sameProposal, 'pf-front-squat', cat(), NOW);
    expect(overlay).toMatchObject({ id: 'pf-front-squat', body: { aliases: [TITLE] } });
    expect(gone).toMatchObject({ id: 'prop-1', deleted: true });
    expect(changeProposal(sameProposal, 'nope', cat(), NOW)).toEqual([]);
  });

  test('undo: alias and lastAutoLink go, the title is noted as undone, other fields stay', () => {
    const [u] = undoAutoLink(linked(NOW - DAY, { description: 'Text.', aliases: ['Other', 'Cable Curl'] }), NOW);
    expect(u!.body).toEqual({ id: 'pf-squat', aliases: ['Other'], description: 'Text.', undoneTitles: ['Cable Curl'] });
    expect(u!.updatedMs).toBe(NOW);
    expect(cat([u!]).find((e) => e.id === 'pf-squat')?.aliases ?? []).not.toContain('Cable Curl');
  });
});

describe('ExerciseProposals card', () => {
  const show = (seed: TrackedRecord[]) => { const f = fakePort(seed); render(<ExerciseProposals port={f.port} now={() => NOW} newId={() => 'x'} />); return f; };

  test('renders nothing without proposals or recent auto links', async () => {
    show([linked(NOW - 15 * DAY), { ...sameProposal, deleted: true }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.body.textContent).toBe('');
  });

  test('rows read plainly, without numbers', async () => {
    show([sameProposal, newProposal, linked()]);
    expect(await screen.findByText(/‚Cable Row Custom‘ ist vermutlich Kniebeuge/)).toBeTruthy();
    expect(screen.getByText('Neue Übung: Zorbo-Zug, Latissimus')).toBeTruthy();
    expect(screen.getByText(/‚Cable Curl‘ als Kniebeuge eingeordnet/)).toBeTruthy();
  });

  test('Bestätigen writes the records through the port, the row goes', async () => {
    const f = show([sameProposal]);
    fireEvent.click(await screen.findByRole('button', { name: 'Bestätigen' }));
    await waitFor(() => expect(f.state.puts).toHaveLength(2));
    expect(f.state.puts.map((r) => `${r.id}:${r.deleted}`)).toEqual(['pf-squat:false', 'prop-1:true']);
    await waitFor(() => expect(screen.queryByText(/ist vermutlich/)).toBeNull());
  });

  test('Ändern opens the picker; the pick links to that exercise', async () => {
    const f = show([sameProposal]);
    fireEvent.click(await screen.findByRole('button', { name: 'Ändern' }));
    const dialog = await screen.findByRole('dialog', { name: 'Übung wählen' });
    fireEvent.click(within(dialog).getAllByRole('button', { name: /Frontkniebeuge/ })[0]!);
    await waitFor(() => expect(f.state.puts).toHaveLength(2));
    expect(f.state.puts[0]).toMatchObject({ id: 'pf-front-squat', body: { aliases: [TITLE] } });
  });

  test('a failed write says so and keeps the row', async () => {
    const f = show([sameProposal]);
    f.state.failPuts = true;
    fireEvent.click(await screen.findByRole('button', { name: 'Bestätigen' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/nicht gespeichert/);
    expect(screen.getByText(/ist vermutlich/)).toBeTruthy();
  });

  test('Rückgängig takes the alias away: the exercise shows "Muskel unbekannt" again in the workout screen', async () => {
    const w: LoggedWorkout = { id: 'o1', title: 'Zuhause', startMs: 1000, endMs: null, source: 'hevy', exercises: [{ exerciseId: 'hevy-x', title: TITLE, supersetId: null, notes: '', sets: [{ type: 'normal', weightKg: 20, reps: 8, durationS: null, doneMs: null }] }] };
    const f = fakePort([linked(NOW - DAY, { aliases: [TITLE], lastAutoLink: { title: TITLE, atMs: NOW - DAY } }), { kind: 'workout', id: 'o1', updatedMs: 1, deleted: false, body: w }]);
    const open = async () => {
      render(<WorkoutScreen port={f.port} now={() => NOW} newId={() => 'x'} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Training fortsetzen' }));
      return (await screen.findByRole('region', { name: TITLE })).querySelector('.tk-ex-head [role="img"]')!.getAttribute('aria-label');
    };
    expect(await open()).not.toBe('Muskel unbekannt');
    cleanup();
    render(<ExerciseProposals port={f.port} now={() => NOW} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
    await waitFor(() => expect(f.state.puts).toHaveLength(1));
    cleanup();
    expect(await open()).toBe('Muskel unbekannt');
    expect(f.state.puts[0]!.body).toMatchObject({ undoneTitles: [TITLE] });
  });
});

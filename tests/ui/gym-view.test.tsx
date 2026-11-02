// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import type { GymPublic } from '../../src/coach/gym/public';
import { initialGymState } from '../../src/coach/gym/state';
import type { GymWorkout } from '../../src/coach/gym/types';
import { HevyCard } from '../../src/ui/views/HevyCard';
import { CoachView } from '../../src/ui/views/CoachView';
import { GymView } from '../../src/ui/views/GymView';
import type { GymConfirmResult } from '../../src/shared/coach-protocol';

afterEach(cleanup);

const workout = (): GymWorkout => ({
  name: 'Ganzkörper A',
  exercises: [
    { templateId: 't1', title: 'Beinpresse', restS: 90, supersetId: null, notes: '', sets: [
      { type: 'warmup', weightKg: 40, reps: 12 },
      { type: 'normal', weightKg: 80, reps: 10 },
      { type: 'failure', weightKg: 80, reps: null, repRange: { start: 8, end: 12 } },
    ] },
    { templateId: 't2', title: 'Rudern am Kabel', restS: null, supersetId: null, notes: 'Langsam ablassen', sets: [{ type: 'normal', weightKg: null, reps: 10 }] },
    { templateId: 't3', title: 'Bizepscurl', restS: null, supersetId: null, notes: '', sets: [{ type: 'normal', weightKg: 0, reps: 12 }] },
  ],
});
const gymOf = (over: Partial<GymPublic['state']> = {}, ready = true, thinking = false): GymPublic => ({
  ready, thinking,
  state: { ...initialGymState('p'), next: { workout: workout(), reason: 'Zuletzt zwei Mal Oberkörper, jetzt Beine.', source: 'rules' }, planned: true, ...over },
});

type Over = { gym?: GymPublic; preview?: { workout: GymWorkout; edited: boolean } | null; result?: GymConfirmResult | null; previewFailed?: boolean };
const show = (o: Over = {}) => {
  const send = vi.fn();
  const clear = vi.fn();
  const view = (p: Over) => <GymView profileId="p" gym={p.gym ?? gymOf()} preview={p.preview ?? null} previewFailed={p.previewFailed ?? false} result={p.result ?? null} send={send} clear={clear} onBack={() => {}} />;
  const r = render(view(o));
  return { send, clear, rerender: (p: Over) => r.rerender(view(p)) };
};

test('the home page shows a Kraft button only with a Hevy connection', () => {
  const props = { profile: { id: 'p', name: 'Mia', ftpW: 200 } as never, state: null, thinking: false, coachConnected: true, sendRide: () => {}, sendCoach: () => {}, onBack: () => {} };
  const { rerender } = render(<CoachView {...props} gym={null} onGym={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Kraft' })).toBeNull();
  const onGym = vi.fn();
  rerender(<CoachView {...props} gym={gymOf()} onGym={onGym} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kraft' }));
  expect(onGym).toHaveBeenCalled();
});

test('shows exercises, sets, reps, weights, set types and the reason', () => {
  show();
  expect(screen.getByText('Beinpresse')).toBeTruthy();
  expect(screen.getByText('Rudern am Kabel')).toBeTruthy();
  expect(screen.getByText(/Zuletzt zwei Mal Oberkörper/)).toBeTruthy();
  expect(screen.getByText(/Aufwärmen/)).toBeTruthy();
  expect(screen.getByText(/bis nichts mehr geht/i)).toBeTruthy();
  expect(screen.getAllByText(/80 kg/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/8–12/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Langsam ablassen/)).toBeTruthy();
});

test('no weight shows as "nach Gefühl", not as null or 0', () => {
  const { container } = render(<GymView profileId="p" gym={gymOf()} preview={null} previewFailed={false} result={null} send={() => {}} clear={() => {}} onBack={() => {}} />);
  expect(screen.getAllByText(/nach Gefühl/).length).toBe(2);
  expect(container.textContent).not.toMatch(/null|\b0 kg|undefined/);
});

test('Leichter, Härter and Kürzer send gym-adjust', () => {
  const { send } = show();
  fireEvent.click(screen.getByRole('button', { name: 'Leichter' }));
  fireEvent.click(screen.getByRole('button', { name: 'Härter' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kürzer' }));
  expect(send.mock.calls.map((c) => c[0])).toEqual([
    { type: 'gym-adjust', profileId: 'p', how: 'easier' },
    { type: 'gym-adjust', profileId: 'p', how: 'harder' },
    { type: 'gym-adjust', profileId: 'p', how: 'shorter' },
  ]);
});

test('"Nach Hevy" asks for a preview and writes nothing; only "Jetzt anlegen" sends gym-confirm; Abbrechen sends nothing', () => {
  const { send, clear, rerender } = show();
  fireEvent.click(screen.getByRole('button', { name: 'Nach Hevy' }));
  expect(send.mock.calls.map((c) => c[0])).toEqual([{ type: 'gym-preview', profileId: 'p' }]);
  expect(clear).toHaveBeenCalled();
  send.mockClear();
  rerender({ preview: { workout: workout(), edited: false } });
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
  expect(send).not.toHaveBeenCalled();
  rerender({ preview: { workout: workout(), edited: false } });
  fireEvent.click(screen.getByRole('button', { name: 'Jetzt anlegen' }));
  expect(send.mock.calls.map((c) => c[0])).toEqual([{ type: 'gym-confirm', profileId: 'p', name: 'Ganzkörper A' }]);
});

test('a double click on "Jetzt anlegen" sends once', () => {
  const { send } = show({ preview: { workout: workout(), edited: false } });
  const b = screen.getByRole('button', { name: 'Jetzt anlegen' });
  fireEvent.click(b);
  fireEvent.click(b);
  expect(send.mock.calls.filter((c) => c[0].type === 'gym-confirm')).toHaveLength(1);
});

test('the preview says when the routine was edited in Hevy', () => {
  show({ preview: { workout: workout(), edited: true } });
  expect(screen.getByText(/in Hevy verändert/)).toBeTruthy();
  expect(screen.getByText(/überschrieben/)).toBeTruthy();
});

test('written is a calm confirmation and closes the preview', () => {
  show({ preview: { workout: workout(), edited: false }, result: 'written' });
  expect(screen.getByRole('status').textContent).toMatch(/in Hevy angelegt/);
  expect(screen.queryByRole('button', { name: 'Jetzt anlegen' })).toBeNull();
});

test('stale says the workout changed and closes the preview', () => {
  show({ preview: { workout: workout(), edited: false }, result: 'stale' });
  expect(screen.getByRole('status').textContent).toMatch(/geändert/);
  expect(screen.queryByRole('button', { name: 'Jetzt anlegen' })).toBeNull();
});

test('failed offers a retry that can send again, without blaming the rider', () => {
  const { send, clear } = show({ preview: { workout: workout(), edited: false }, result: 'failed' });
  expect(screen.getByRole('alert').textContent).toMatch(/nicht geklappt/);
  fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }));
  expect(clear).toHaveBeenCalledWith('result');
  expect(send.mock.calls.map((c) => c[0])).toEqual([{ type: 'gym-confirm', profileId: 'p', name: 'Ganzkörper A' }]);
});

test('a missing preview says so', () => {
  show({ previewFailed: true });
  expect(screen.getByRole('status').textContent).toMatch(/Vorschau/);
});

test('leaving the page clears preview and result', () => {
  const { clear } = show();
  cleanup();
  expect(clear).toHaveBeenCalledWith('all');
});

test('no workout but a reason: shows the reason and no Hevy button', () => {
  show({ gym: gymOf({ next: null, emptyReason: 'Noch nichts passend zu deinen Geräten.' }) });
  expect(screen.getByText(/Noch nichts passend/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Nach Hevy' })).toBeNull();
});

test('without a ready history there is no Hevy button', () => {
  show({ gym: gymOf({}, false) });
  expect(screen.queryByRole('button', { name: 'Nach Hevy' })).toBeNull();
});

test('while loading it says so, with no history it shows a friendly note', () => {
  const a = show({ gym: gymOf({ next: null, planned: false }, false) });
  expect(screen.getByRole('status').textContent).toMatch(/Verlauf wird noch geladen/);
  cleanup();
  a.send.mockClear();
  show({ gym: gymOf({ next: null, emptyReason: null }) });
  expect(screen.getByRole('status').textContent).toMatch(/Sobald/);
});

test('shows the note and questions; a question can be answered or skipped', () => {
  const lastNote = { workoutId: 'w', text: 'Schön gleichmäßig trainiert.', questions: ['Wie war die Beinpresse?', 'Zu viel?'], atMs: 1 };
  const { send } = show({ gym: gymOf({ lastNote }) });
  expect(screen.getByText('Schön gleichmäßig trainiert.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Antwort auf: Wie war die Beinpresse?'), { target: { value: 'Gut' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Antworten' })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Überspringen' })[1]);
  expect(send.mock.calls.map((c) => c[0])).toEqual([
    { type: 'gym-answer', profileId: 'p', question: 'Wie war die Beinpresse?', text: 'Gut' },
    { type: 'gym-skip-question', profileId: 'p', question: 'Zu viel?' },
  ]);
});

test('sends a note to the gym coach', () => {
  const { send } = show();
  fireEvent.change(screen.getByLabelText('Hinweis an den Kraft-Coach'), { target: { value: 'Knie mag keine tiefen Kniebeugen' } });
  fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
  expect(send).toHaveBeenCalledWith({ type: 'gym-note', profileId: 'p', text: 'Knie mag keine tiefen Kniebeugen' });
});

test('shows and removes what the coach remembers', () => {
  const { send } = show({ gym: gymOf({ rules: [{ atMs: 5, text: 'Keine tiefen Kniebeugen' }] }) });
  expect(screen.getByText('Keine tiefen Kniebeugen')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
  expect(send).toHaveBeenCalledWith({ type: 'gym-remove-rule', profileId: 'p', atMs: 5 });
});

test('the Hevy card says routines are only created after confirmation', () => {
  render(<HevyCard profileId="p" status={{ state: 'idle' }} send={() => {}} />);
  expect(screen.queryByText(/liest bei Hevy nur/)).toBeNull();
  expect(screen.getByText(/nur nach deiner Bestätigung/)).toBeTruthy();
});

test('after disconnecting the Hevy card offers to delete the coach\'s memory', () => {
  const send = vi.fn();
  const connected = { state: 'connected', workouts: 3, loading: false, lastSyncMs: null } as const;
  const { rerender } = render(<HevyCard profileId="p" status={connected} send={send} />);
  expect(screen.queryByRole('button', { name: /Gedächtnis löschen/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Trennen' }));
  rerender(<HevyCard profileId="p" status={{ state: 'idle' }} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: /Gedächtnis löschen/ }));
  expect(send).toHaveBeenCalledWith({ type: 'gym-forget', profileId: 'p' });
});

test('a decimal weight uses a comma', () => {
  const w = workout();
  w.exercises[0].sets[1].weightKg = 62.5;
  const { container } = render(<GymView profileId="p" gym={gymOf({ next: { workout: w, reason: 'x', source: 'rules' } })} preview={{ workout: w, edited: false }} previewFailed={false} result={null} send={() => {}} clear={() => {}} onBack={() => {}} />);
  expect(container.textContent).toContain('62,5 kg');
  expect(container.textContent).not.toContain('62.5');
});

test('an adjustment closes the preview and clears the old result', () => {
  const clear = vi.fn();
  const send = vi.fn();
  render(<GymView profileId="p" gym={gymOf()} preview={{ workout: workout(), edited: false }} previewFailed={false} result="failed" send={send} clear={clear} onBack={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Härter' }));
  expect(clear).toHaveBeenCalledWith('all');
  expect(send).toHaveBeenCalledWith({ type: 'gym-adjust', profileId: 'p', how: 'harder' });
});

test('after an adjustment the preview is gone', () => {
  const Host = () => {
    const [preview, setPreview] = React.useState<{ workout: GymWorkout; edited: boolean } | null>({ workout: workout(), edited: false });
    return <GymView profileId="p" gym={gymOf()} preview={preview} previewFailed={false} result={null} send={() => {}} clear={() => setPreview(null)} onBack={() => {}} />;
  };
  render(<Host />);
  expect(screen.getByRole('button', { name: 'Jetzt anlegen' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Härter' }));
  expect(screen.queryByRole('button', { name: 'Jetzt anlegen' })).toBeNull();
});

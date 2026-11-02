// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { homeScreen } from '../../src/ui/views/OverviewView';
import { initialGymState } from '../../src/coach/gym/state';

afterEach(cleanup);
const h = vi.hoisted(() => ({ hevy: { state: 'idle' } as unknown, garmin: { state: 'idle' } as unknown, coachState: null as unknown, arrived: true, engine: null as unknown, sent: [] as unknown[] }));
vi.mock('../../src/ui/useCoach', () => ({ useCoach: () => ({
  statusArrived: h.arrived, state: h.coachState, thinking: false, connected: true, send: (m: unknown) => { h.sent.push(m); }, hevy: h.hevy, garmin: h.garmin, together: null,
  gym: (h.hevy as { state: string }).state === 'connected' ? { ready: true, thinking: false, complaints: [], hasHistory: false, state: { ...initialGymState('a'), emptyReason: 'Noch nichts.' } } : null,
  gymPreview: null, gymPreviewFailed: false, gymConfirmResult: null, clearGym: () => {},
  strengthHealth: (h.hevy as { state: string }).state === 'connected' ? { recent: [{ id: 'w', title: 'Beine', startMs: Date.parse('2027-06-14T10:00:00Z'), minutes: 45, sets: 9, volumeKg: 4200 }], weeks: [{ weekStartMs: Date.parse('2027-06-14T00:00:00Z'), workouts: 1, volumeKg: 4200 }] } : null,
  garminHealth: null,
}) }));
vi.mock('../../src/ui/useRide', () => ({ useRide: () => ({
  state: { type: 'state', ride: h.engine ? { profileId: 'a' } : null, engine: h.engine, devices: {}, latest: {}, storageError: false, recovered: false, profiles: [{ id: 'a', name: 'Mia', ftpW: 200 }] },
  offer: null, clearOffer: () => {}, connected: true, send: () => {}, error: null,
}) }));
vi.mock('../../src/ui/views/RideView', () => ({ RideView: () => <p>Fahrt läuft</p> }));
vi.mock('../../src/ui/views/FeedbackView', () => ({ FeedbackView: () => <p>Wie war es?</p> }));

const connected = { state: 'connected', workouts: 3, loading: false, lastSyncMs: null };
beforeEach(() => { h.hevy = { state: 'idle' }; h.garmin = { state: 'idle' }; h.coachState = null; h.engine = null; h.sent = []; h.arrived = true; });
const pickMia = () => fireEvent.click(screen.getByRole('button', { name: 'Mia' }));

test('without Hevy the profile opens the bike page directly', () => {
  expect(homeScreen({ state: 'idle' })).toBe('bike');
  render(<App />);
  pickMia();
  expect(screen.getByRole('button', { name: 'Profil wechseln' })).toBeTruthy();
  for (const name of ['Rad', 'Kraft', 'Gesundheit', 'Übersicht']) expect(screen.queryByRole('button', { name })).toBeNull();
});
test('with Hevy the overview offers Rad, Kraft and Gesundheit', () => {
  h.hevy = connected;
  expect(homeScreen(connected as never)).toBe('overview');
  render(<App />);
  pickMia();
  for (const name of ['Rad', 'Kraft', 'Gesundheit']) expect(screen.getByRole('button', { name })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Rad' }));
  expect(screen.getByRole('button', { name: 'Profil wechseln' })).toBeTruthy();
});
test('an open rating or debrief still comes first, and a running ride always does', () => {
  h.hevy = connected;
  h.coachState = { awaitingFeedback: 'r1', summaries: [], feedback: {}, notes: [], changes: [] };
  const { unmount } = render(<App />);
  pickMia();
  expect(screen.getByText('Wie war es?')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Kraft' })).toBeNull();
  unmount();
  h.coachState = null; h.engine = { stepIndex: 0, paused: false };
  render(<App />);
  expect(screen.getByText('Fahrt läuft')).toBeTruthy();
});
test('both coaches link to Gesundheit and back to the overview', () => {
  h.hevy = connected;
  render(<App />);
  pickMia();
  fireEvent.click(screen.getByRole('button', { name: 'Rad' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gesundheit' }));
  expect(screen.getByRole('heading', { name: 'Gesundheit' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
  fireEvent.click(screen.getByRole('button', { name: 'Übersicht' }));
  expect(screen.getByRole('button', { name: 'Rad' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Kraft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gesundheit' }));
  expect(screen.getByRole('heading', { name: 'Gesundheit' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
  fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
  expect(screen.getByRole('button', { name: 'Rad' })).toBeTruthy();
});
test('the overview is left when the profile changes', () => {
  h.hevy = connected;
  render(<App />);
  pickMia();
  fireEvent.click(screen.getByRole('button', { name: 'Rad' }));
  fireEvent.click(screen.getByRole('button', { name: 'Profil wechseln' }));
  pickMia();
  expect(screen.getByRole('button', { name: 'Rad' })).toBeTruthy();
});

test('no status yet shows neither home screen; a status decides', () => {
  h.arrived = false;
  const { rerender } = render(<App />);
  pickMia();
  expect(screen.queryByRole('button', { name: 'Rad' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Profil wechseln' })).toBeNull();
  h.arrived = true; h.hevy = connected;
  rerender(<App />);
  expect(screen.getByRole('button', { name: 'Rad' })).toBeTruthy();
});
test('a status that is not connected shows the bike page', () => {
  render(<App />);
  pickMia();
  expect(screen.getByRole('button', { name: 'Profil wechseln' })).toBeTruthy();
});
test('no status after 500 ms shows the bike page and a late connected status leaves it there', () => {
  vi.useFakeTimers();
  try {
    h.arrived = false;
    const { rerender } = render(<App />);
    pickMia();
    expect(screen.queryByRole('button', { name: 'Profil wechseln' })).toBeNull();
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByRole('button', { name: 'Profil wechseln' })).toBeTruthy();
    h.arrived = true; h.hevy = connected;
    rerender(<App />);
    expect(screen.getByRole('button', { name: 'Profil wechseln' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rad' })).toBeNull();
  } finally { vi.useRealTimers(); }
});
test('a running ride wins while the status is missing', () => {
  h.arrived = false; h.engine = { stepIndex: 0, paused: false };
  render(<App />);
  expect(screen.getByText('Fahrt läuft')).toBeTruthy();
});
test('the Rad choice survives connecting and failed, and ends with a real disconnect', () => {
  h.hevy = connected;
  const { rerender } = render(<App />);
  pickMia();
  fireEvent.click(screen.getByRole('button', { name: 'Rad' }));
  h.hevy = { state: 'connecting' }; rerender(<App />);
  h.hevy = { state: 'failed', reason: 'expired' }; rerender(<App />);
  h.hevy = connected; rerender(<App />);
  expect(screen.queryByRole('button', { name: 'Rad' })).toBeNull();
  h.hevy = { state: 'idle' }; rerender(<App />);
  h.hevy = connected; rerender(<App />);
  expect(screen.getByRole('button', { name: 'Rad' })).toBeTruthy();
});
test('Hevy without Garmin never waits for Garmin data; with Garmin failed it shows the Garmin sections', () => {
  h.hevy = connected;
  const { unmount } = render(<App />);
  pickMia();
  fireEvent.click(screen.getByRole('button', { name: 'Gesundheit' }));
  expect(screen.queryByText(/Seite lädt/)).toBeNull();
  unmount();
  h.garmin = { state: 'failed', reason: 'failed' };
  render(<App />);
  pickMia();
  fireEvent.click(screen.getByRole('button', { name: 'Gesundheit' }));
  expect(screen.getByText(/Seite lädt/)).toBeTruthy();
});

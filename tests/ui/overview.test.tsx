// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
const menu = () => within(screen.getByRole('navigation', { name: 'Hauptmenü' }));
const menuNames = () => menu().getAllByRole('button').map((b) => b.textContent);
const go = (name: string) => fireEvent.click(menu().getByRole('button', { name }));
const overviewShown = () => document.querySelector('.choices') !== null;
const tile = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}.+`) }));

test('without Hevy the profile opens the bike page directly', () => {
  expect(homeScreen({ state: 'idle' })).toBe('bike');
  render(<App />);
  pickMia();
  expect(overviewShown()).toBe(false);
  expect(menuNames()).toEqual(['Rad', 'Profil', 'Profil wechseln']);
  expect(menu().getByRole('button', { name: 'Rad' }).getAttribute('aria-current')).toBe('page');
});
test('with Hevy the overview offers Rad, Kraft and Gesundheit', () => {
  h.hevy = connected;
  expect(homeScreen(connected as never)).toBe('overview');
  render(<App />);
  pickMia();
  expect(overviewShown()).toBe(true);
  for (const name of ['Rad', 'Kraft', 'Gesundheit']) expect(screen.getByRole('button', { name: new RegExp(`^${name}.+`) }).closest('.choices')).toBeTruthy();
  tile('Rad');
  expect(overviewShown()).toBe(false);
  expect(menu().getByRole('button', { name: 'Rad' }).getAttribute('aria-current')).toBe('page');
});
test('an open rating or debrief still comes first, and a running ride always does', () => {
  h.hevy = connected;
  h.coachState = { awaitingFeedback: 'r1', summaries: [], feedback: {}, notes: [], changes: [] };
  const { unmount } = render(<App />);
  pickMia();
  expect(screen.getByText('Wie war es?')).toBeTruthy();
  expect(overviewShown()).toBe(false);
  unmount();
  h.coachState = null; h.engine = { stepIndex: 0, paused: false };
  render(<App />);
  expect(screen.getByText('Fahrt läuft')).toBeTruthy();
});
test('both coaches link to Gesundheit and back to the overview', () => {
  h.hevy = connected;
  render(<App />);
  pickMia();
  go('Rad');
  go('Gesundheit');
  expect(screen.getByRole('heading', { name: 'Gesundheit' })).toBeTruthy();
  go('Start');
  expect(overviewShown()).toBe(true);
  go('Kraft');
  expect(screen.getByRole('heading', { name: 'Kraft' })).toBeTruthy();
  go('Gesundheit');
  expect(screen.getByRole('heading', { name: 'Gesundheit' })).toBeTruthy();
  go('Start');
  expect(overviewShown()).toBe(true);
});
test('the overview is left when the profile changes', () => {
  h.hevy = connected;
  render(<App />);
  pickMia();
  go('Rad');
  go('Profil wechseln');
  pickMia();
  expect(overviewShown()).toBe(true);
});

test('no status yet shows neither home screen; a status decides', () => {
  h.arrived = false;
  const { rerender } = render(<App />);
  pickMia();
  expect(overviewShown()).toBe(false);
  expect(screen.queryByRole('navigation', { name: 'Hauptmenü' })).toBeNull();
  h.arrived = true; h.hevy = connected;
  rerender(<App />);
  expect(overviewShown()).toBe(true);
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
    expect(overviewShown()).toBe(false);
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
  tile('Rad');
  h.hevy = { state: 'connecting' }; rerender(<App />);
  h.hevy = { state: 'failed', reason: 'expired' }; rerender(<App />);
  h.hevy = connected; rerender(<App />);
  expect(overviewShown()).toBe(false);
  h.hevy = { state: 'idle' }; rerender(<App />);
  h.hevy = connected; rerender(<App />);
  expect(overviewShown()).toBe(true);
});
test('Hevy without Garmin never waits for Garmin data; with Garmin failed it shows the Garmin sections', () => {
  h.hevy = connected;
  const { unmount } = render(<App />);
  pickMia();
  go('Gesundheit');
  expect(screen.queryByText(/Seite lädt/)).toBeNull();
  unmount();
  h.garmin = { state: 'failed', reason: 'failed' };
  render(<App />);
  pickMia();
  go('Gesundheit');
  expect(screen.getByText(/Seite lädt/)).toBeTruthy();
});

describe('menu bar', () => {
  test('the same bar on every screen, with the active item marked', () => {
    h.hevy = connected; h.coachState = { profileId: 'a', ftpW: 200, ftpHistory: [], phase: { name: 'Aufbau', weeksLeft: 3, goal: 'x' }, ftpForecast: [], next: null, changes: [], notes: [], feedback: {}, summaries: [], processedRides: [], awaitingFeedback: null };
    render(<App />);
    pickMia();
    const expected = ['Start', 'Rad', 'Kraft', 'Verlauf', 'Gesundheit', 'Profil', 'Profil wechseln'];
    expect(menuNames()).toEqual(expected);
    for (const name of ['Rad', 'Kraft', 'Verlauf', 'Gesundheit', 'Profil', 'Start']) {
      go(name);
      expect(menuNames()).toEqual(expected);
      expect(menu().getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page').map((b) => b.textContent)).toEqual([name]);
    }
  });
  test('the profile page holds the settings and every connection, each optional', () => {
    render(<App />);
    pickMia();
    go('Profil');
    expect(screen.getByRole('heading', { name: 'Dein Profil' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sprachen lernen/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Verbindungen' })).toBeTruthy();
    expect(screen.getByText(/freiwillig/)).toBeTruthy();
    for (const t of ['Garmin verbinden (optional)', 'Hevy verbinden (optional)', 'Pandafit-Konto verbinden (optional)']) expect(screen.getByText(t)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Krafttraining starten' }));
    expect(h.sent).toContainEqual({ type: 'gym-start', profileId: 'a' });
  });
  test('never during a ride: the ride screen has no menu bar', () => {
    render(<App />);
    pickMia();
    expect(screen.getByRole('navigation', { name: 'Hauptmenü' })).toBeTruthy();
    cleanup();
    h.engine = { stepIndex: 0, paused: false };
    render(<App />);
    expect(screen.getByText('Fahrt läuft')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Hauptmenü' })).toBeNull();
  });
  test('switching profile leaves nothing of the old screen behind', () => {
    h.hevy = connected;
    render(<App />);
    pickMia();
    go('Gesundheit');
    go('Profil wechseln');
    pickMia();
    expect(overviewShown()).toBe(true);
  });
});

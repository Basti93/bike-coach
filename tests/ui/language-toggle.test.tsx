// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';

const profiles = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }];
const ride = { current: 'A' };
vi.mock('../../src/ui/useCoach', () => ({ useCoach: () => ({
  state: { profileId: ride.current, ftpW: 200, wordProgress: {} }, thinking: false, connected: true, send: () => {},
}) }));
vi.mock('../../src/ui/useRide', () => ({ useRide: () => ({
  state: {
    type: 'state', session: null, profiles, storageError: false, recovered: false,
    ride: { rideId: 'r', profileId: ride.current, sessionId: 's', startedAtMs: 1, status: 'open' },
    engine: { stepIndex: 0, stepRemainingS: 100, rideElapsedS: 1, targetW: 100, gradePct: null, gear: null, label: 'Locker', nextLabel: null, secondsToNext: 100, autoReducedPct: 0, paused: false },
    devices: { trainer: 'connected', hr: 'connected', clicker: 'connected' }, latest: {},
  },
  click: null, offer: null, clearOffer: () => {}, connected: true, send: () => {}, error: null,
}) }));

beforeEach(() => { localStorage.clear(); ride.current = 'A'; });
afterEach(cleanup);
const card = () => document.querySelector('.word');

test('word cards show by default and can be switched off and on during a ride', () => {
  render(<App />);
  expect(card()).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sprachen lernen: an' }));
  expect(card()).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sprachen lernen: aus' }));
  expect(card()).not.toBeNull();
});
test('the choice survives a restart and belongs to one profile', () => {
  const first = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Sprachen lernen: an' }));
  first.unmount();
  render(<App />);
  expect(card()).toBeNull();
  cleanup();
  ride.current = 'B';
  render(<App />);
  expect(card()).not.toBeNull();
});

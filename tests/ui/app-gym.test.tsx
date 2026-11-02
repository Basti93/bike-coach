// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { initialGymState } from '../../src/coach/gym/state';

afterEach(cleanup);
const h = vi.hoisted(() => ({ gym: null as unknown }));
vi.mock('../../src/ui/useCoach', () => ({ useCoach: () => ({ state: null, thinking: false, connected: true, send: () => {}, hevy: { state: 'idle' }, garmin: { state: 'idle' }, together: null, gym: h.gym, gymPreview: null, gymPreviewFailed: false, gymConfirmResult: null, clearGym: () => {} }) }));
vi.mock('../../src/ui/useRide', () => ({ useRide: () => ({
  state: { type: 'state', ride: null, engine: null, devices: {}, latest: {}, storageError: false, recovered: false, profiles: [{ id: 'a', name: 'Mia', ftpW: 200 }, { id: 'b', name: 'Jo', ftpW: 200 }] },
  offer: null, clearOffer: () => {}, connected: true, send: () => {}, error: null,
}) }));

const gym = () => ({ ready: true, thinking: false, state: { ...initialGymState('a'), emptyReason: 'Noch nichts.' } });

test('the next profile starts at home, not on the strength page', () => {
  h.gym = gym();
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Mia' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kraft' }));
  expect(screen.getByRole('heading', { name: 'Kraft' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
  fireEvent.click(screen.getByRole('button', { name: 'Profil wechseln' }));
  fireEvent.click(screen.getByRole('button', { name: 'Jo' }));
  expect(screen.queryByRole('heading', { name: 'Kraft' })).toBeNull();
});

test('switching profile from the strength page ends it; losing gym ends it too', () => {
  h.gym = gym();
  const { rerender } = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Mia' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kraft' }));
  h.gym = null;
  rerender(<App />);
  h.gym = gym();
  rerender(<App />);
  expect(screen.queryByRole('heading', { name: 'Kraft' })).toBeNull();
});

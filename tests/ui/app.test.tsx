// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';

afterEach(cleanup);
vi.mock('../../src/ui/useCoach', () => ({ useCoach: () => ({ state: null, thinking: false, connected: false, send: () => {} }) }));
vi.mock('../../src/ui/useRide', () => ({ useRide: () => ({
  state: { type: 'state', ride: null, engine: null, devices: {}, latest: {}, storageError: false, recovered: false, profiles: [] },
  offer: null, clearOffer: () => {}, connected: true, send: () => {}, error: 'Speicher voll',
}) }));
test('service errors are shown', () => {
  render(<App />);
  expect(screen.getByRole('alert').textContent).toContain('Speicher voll');
});
test('the small film window has no status bar, so the numbers stay visible', () => {
  window.location.hash = '#film';
  render(<App />);
  expect(screen.queryByText('Problem melden')).toBeNull();
  window.location.hash = '';
});

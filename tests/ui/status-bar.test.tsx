// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { StatusBar } from '../../src/ui/views/StatusBar';
import type { StateMessage } from '../../src/shared/protocol';

afterEach(cleanup);
const state = (s: Partial<StateMessage> = {}): StateMessage => ({
  type: 'state', session: null, ride: null, engine: null,
  devices: { trainer: 'connected', hr: 'connected', clicker: 'searching' },
  latest: { hrBpm: 131.4 }, storageError: false, recovered: false, profiles: [], ...s,
});

test('shows heart rate and a connected trainer', () => {
  render(<StatusBar state={state()} connected />);
  expect(screen.getByTestId('status-hr').textContent).toContain('131');
  expect(screen.getByTestId('status-trainer').textContent).toContain('verbunden');
});
test('shows a trainer that is still being searched and a missing heart rate', () => {
  render(<StatusBar state={state({ devices: { trainer: 'searching', hr: 'searching', clicker: 'searching' }, latest: {} })} connected />);
  expect(screen.getByTestId('status-hr').textContent).toContain('–');
  expect(screen.getByTestId('status-trainer').textContent).toContain('wird gesucht');
});
test('does not show stale values while the service is unreachable', () => {
  render(<StatusBar state={state()} connected={false} />);
  expect(screen.getByTestId('status-hr').textContent).toContain('–');
  expect(screen.getByTestId('status-trainer').textContent).toContain('unbekannt');
});
test('names exactly which devices are connected', () => {
  render(<StatusBar connected state={state({
    devices: { trainer: 'connected', hr: 'connected', clicker: 'searching' },
    deviceNames: { trainer: 'Zwift Hub', hr: 'Polar H10 CCD65527' },
  })} />);
  expect(screen.getByTestId('status-trainer').textContent).toContain('Zwift Hub');
  expect(screen.getByTestId('status-puls').textContent).toContain('Polar H10 CCD65527');
  expect(screen.getByTestId('status-clicker').textContent).toContain('wird gesucht');
});
test('the heart beats at the measured rate and rests without one', () => {
  const { rerender } = render(<StatusBar connected state={state({ latest: { hrBpm: 120 } })} />);
  expect(screen.getByTestId('heart').style.animationDuration).toBe('0.5s');
  rerender(<StatusBar connected state={state({ latest: {} })} />);
  expect(screen.getByTestId('heart').style.animationDuration).toBe('');
});

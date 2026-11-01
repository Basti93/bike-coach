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

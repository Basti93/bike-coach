// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RecoveryDialog } from '../../src/ui/views/RecoveryDialog';
import { RideView } from '../../src/ui/views/RideView';
import type { StateMessage } from '../../src/shared/protocol';

afterEach(cleanup);
const base: StateMessage = {
  type: 'state',
  ride: { rideId: 'r', profileId: 'A', sessionId: 's', startedAtMs: 1, status: 'open' },
  engine: { stepIndex: 0, stepRemainingS: 125, rideElapsedS: 10, targetW: 150, gradePct: null, gear: null, label: 'Warmup', nextLabel: 'Anstieg', secondsToNext: 125, autoReducedPct: 0 },
  devices: { trainer: 'connected', hr: 'connected', clicker: 'searching' },
  latest: { powerW: 148, hrBpm: 130, cadenceRpm: 85 },
  storageError: false, recovered: false, profiles: [],
};
const view = (s: Partial<StateMessage> = {}, send = vi.fn()) => { render(<RideView state={{ ...base, ...s }} send={send} />); return send; };

test('shows target, power, heart rate and remaining time', () => {
  view();
  expect(screen.getByTestId('target').textContent).toContain('150');
  expect(screen.getByTestId('power').textContent).toContain('148');
  expect(screen.getByTestId('hr').textContent).toContain('130');
  expect(screen.getByTestId('remaining').textContent).toContain('2:05');
});
test('warns before a step change', () => {
  view({ engine: { ...base.engine!, secondsToNext: 10 } });
  expect(screen.getByRole('alert').textContent).toContain('Anstieg');
});
test('missing heart rate shows dash, not error', () => {
  view({ latest: { powerW: 100 } });
  expect(screen.getByTestId('hr').textContent).toContain('–');
});
test('storage error shows prominent warning', () => {
  view({ storageError: true });
  expect(screen.getByRole('alert').textContent).toContain('Speichern');
});
test('recovery dialog names the original profile', () => {
  const resume = vi.fn();
  render(<RecoveryDialog offer={{ type: 'recovery-offer', rideId: 'r', profileId: 'A', sessionName: 'Berg', rideElapsedS: 80 }} profileName="Anna" send={resume} onClose={() => {}} />);
  expect(screen.getByRole('dialog').textContent).toContain('Anna');
  fireEvent.click(screen.getByText('Weiterfahren'));
  expect(resume).toHaveBeenCalledWith({ type: 'resume', rideId: 'r' });
});
test('arrow keys send shift messages', () => {
  const send = view();
  fireEvent.keyDown(window, { key: 'ArrowUp' });
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(send.mock.calls.map((c) => c[0])).toEqual([{ type: 'shift', dir: 'up' }, { type: 'shift', dir: 'down' }]);
});
test('m key sets a marker', () => {
  const send = view();
  fireEvent.keyDown(window, { key: 'm' });
  expect(send).toHaveBeenCalledWith({ type: 'mark' });
});
test('shows the automatic reduction', () => {
  view({ engine: { ...base.engine!, autoReducedPct: 10 } });
  expect(document.body.textContent).toContain('automatisch um 10 % gesenkt');
});

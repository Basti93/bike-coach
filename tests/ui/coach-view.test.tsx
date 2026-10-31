// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CoachState } from '../../src/coach/state';
import { CoachView } from '../../src/ui/views/CoachView';

afterEach(cleanup);
const session = { id: 'ki', name: 'Grundlage plus', steps: [{ kind: 'erg' as const, durationS: 600, ftpFraction: 0.5, label: 'Warmup' }] };
const profile = { id: 'pa', name: 'Anna', ftpW: 150, maxHrBpm: 175 };
const state = { profileId: 'pa', ftpW: 180, ftpHistory: [], phase: { name: 'Aufbau', weeksLeft: 3, goal: 'x' }, ftpForecast: [], next: { session, reason: 'y', source: 'claude' }, changes: [], notes: [], feedback: {}, summaries: [], processedRides: [], awaitingFeedback: null, dirty: false, dirtySinceMs: null, lastError: null, lastAttemptMs: null } as CoachState;
const view = (s: CoachState | null) => {
  const ride = vi.fn();
  render(<CoachView profile={profile} state={s} thinking={false} coachConnected={!!s} sendRide={ride} sendCoach={vi.fn()} onBack={() => {}} />);
  return ride;
};
test('start uses coach session, coach FTP and the pulse limit', () => {
  const ride = view(state);
  fireEvent.click(screen.getByText('Los'));
  expect(ride).toHaveBeenCalledWith({ type: 'start', profileId: 'pa', session, ftpW: 180, maxHrBpm: 175 });
});
test('without the coach you can still ride a starter session', () => {
  const ride = view(null);
  fireEvent.click(within(screen.getByText('Locker, 30 Minuten').closest('article')!).getByText('Auswählen'));
  expect(ride).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Los'));
  expect(ride.mock.calls[0][0]).toMatchObject({ type: 'start', ftpW: 150 });
});

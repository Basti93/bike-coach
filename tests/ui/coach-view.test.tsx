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

test('the health page is offered only with a connected Garmin', () => {
  const onHealth = vi.fn();
  const props = { profile: { id: 'p', name: 'S', ftpW: 100 }, state: null, thinking: false, coachConnected: true, sendRide: vi.fn(), sendCoach: vi.fn(), onBack: vi.fn(), onHealth };
  const first = render(<CoachView {...props} garmin={{ state: 'idle' }} />);
  expect(screen.queryByRole('button', { name: 'Gesundheit' })).toBeNull();
  first.unmount();
  render(<CoachView {...props} garmin={{ state: 'connected' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Gesundheit' }));
  expect(onHealth).toHaveBeenCalled();
});

test('the next ride comes before everything else, the Garmin login does not push it down', () => {
  const garmin = { state: 'idle' } as const;
  render(<CoachView profile={profile} state={state} thinking={false} coachConnected sendRide={vi.fn()} sendCoach={vi.fn()} onBack={() => {}} garmin={garmin} />);
  const go = screen.getByText('Los');
  const connect = screen.getByText('Garmin verbinden', { selector: 'summary' });
  expect(go.compareDocumentPosition(connect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(connect.closest('details')?.open).toBe(false);
});
test('a connected Garmin is one small line after the plan, details on request', () => {
  render(<CoachView profile={profile} state={state} thinking={false} coachConnected sendRide={vi.fn()} sendCoach={vi.fn()} onBack={() => {}} garmin={{ state: 'connected' }} />);
  const line = screen.getByText('Garmin verbunden');
  expect(line.closest('details')?.open).toBe(false);
  expect(screen.getByText('Los').compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
test('a Garmin that needs a new login stays in view', () => {
  render(<CoachView profile={profile} state={state} thinking={false} coachConnected sendRide={vi.fn()} sendCoach={vi.fn()} onBack={() => {}} garmin={{ state: 'connected' }} garminSync={{ running: false, complete: true, lastRunMs: null, problem: 'reauth' } as never} />);
  expect(screen.getByText('Los').compareDocumentPosition(screen.getByRole('button', { name: /verbinden/i })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
});
test('the note to the coach sits with the coach words, before the next ride', () => {
  view(state);
  const field = screen.getByRole('textbox', { name: 'Hinweis an den Coach' });
  expect(field.closest('.encouragement')).toBeTruthy();
  expect(field.compareDocumentPosition(screen.getByText('Los')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

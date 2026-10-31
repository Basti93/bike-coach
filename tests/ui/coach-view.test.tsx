// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CoachState } from '../../src/coach/state';
import { rampTest } from '../../src/coach/rules';
import { CoachView } from '../../src/ui/views/CoachView';
import { FeedbackView } from '../../src/ui/views/FeedbackView';

afterEach(cleanup);
const session = { id: 'ki', name: 'Grundlage plus', steps: [{ kind: 'erg' as const, durationS: 600, ftpFraction: 0.5, label: 'Warmup' }] };
const profile = { id: 'pa', name: 'Anna', ftpW: 150, maxHrBpm: 175 };
const state = (over: Partial<CoachState> = {}): CoachState => ({
  profileId: 'pa', ftpW: 180, ftpHistory: [], phase: { name: 'Aufbau', weeksLeft: 3, goal: 'Regelmäßig fahren' },
  ftpForecast: [{ weeksAhead: 4, ftpW: 190 }], next: { session, reason: 'Du bist gut erholt.', source: 'claude' },
  changes: [{ atMs: 1000, text: 'Alt' }, { atMs: 2000, text: 'Neu' }], notes: [{ atMs: 1, text: 'Knie zwickt', reply: 'Gute Besserung.' }],
  feedback: {}, summaries: [], processedRides: [], awaitingFeedback: null, dirty: false, dirtySinceMs: null, lastError: null, lastAttemptMs: null, ...over,
});
const view = (s: CoachState | null = state(), coachConnected = true) => {
  const ride = vi.fn(); const coach = vi.fn();
  render(<CoachView profile={profile} state={s} thinking={false} coachConnected={coachConnected} sendRide={ride} sendCoach={coach} onBack={() => {}} />);
  return { ride, coach };
};
test('shows next session, reason, phase and forecast', () => {
  view();
  const text = document.body.textContent!;
  for (const t of ['Grundlage plus', 'Du bist gut erholt.', 'Aufbau', 'Regelmäßig fahren', '190 W', '180 W']) expect(text).toContain(t);
});
test('start uses coach session, coach FTP and the pulse limit', () => {
  const { ride } = view();
  fireEvent.click(screen.getByText('Los'));
  expect(ride).toHaveBeenCalledWith({ type: 'start', profileId: 'pa', session, ftpW: 180, maxHrBpm: 175 });
});
test.each([['Leichter', 'easier'], ['Härter', 'harder'], ['Kürzer', 'shorter']])('%s sends adjust', (label, how) => {
  const { coach } = view();
  fireEvent.click(screen.getByText(label));
  expect(coach).toHaveBeenCalledWith({ type: 'adjust', profileId: 'pa', how });
});
test('coach unreachable still offers starter sessions with the profile FTP', () => {
  const { ride } = view(null, false);
  expect(document.body.textContent).toContain('Coach ist gerade nicht erreichbar');
  fireEvent.click(screen.getByText('Locker, 30 Minuten'));
  expect(ride.mock.calls[0][0]).toMatchObject({ type: 'start', ftpW: 150 });
});
test.each([['limit', 'Limit'], ['missing', 'nicht gefunden'], ['timeout', 'nicht rechtzeitig']] as const)('rule source shows a calm notice for %s', (kind, text) => {
  view(state({ lastError: kind, next: { session, reason: 'x', source: 'rules' } }));
  expect(screen.getByRole('status').textContent).toContain(text);
});
test('note is sent and the reply is displayed', () => {
  const { coach } = view();
  expect(document.body.textContent).toContain('Gute Besserung.');
  fireEvent.change(screen.getByLabelText('Hinweis an den Coach'), { target: { value: 'Bin weg' } });
  fireEvent.click(screen.getByText('Senden'));
  expect(coach).toHaveBeenCalledWith({ type: 'note', profileId: 'pa', text: 'Bin weg' });
});
test('empty note is not sent', () => {
  const { coach } = view();
  fireEvent.click(screen.getByText('Senden'));
  expect(coach).not.toHaveBeenCalled();
});
test('review lists what changed and why, newest first', () => {
  view();
  const items = screen.getAllByRole('listitem').map((x) => x.textContent!).filter((t) => /Alt|Neu/.test(t));
  expect(items[0]).toContain('Neu');
});
test('ramp test explains to ride until exhausted, then press stop', () => {
  view(state({ next: { session: rampTest(180), reason: 'x', source: 'rules' } }));
  expect(document.body.textContent).toMatch(/bis es nicht mehr geht/);
  expect(document.body.textContent).toContain('Beenden');
  expect(screen.queryByText('Härter')).toBeNull();
});
test('feedback appears for the awaited ride and sends rating', () => {
  const send = vi.fn();
  render(<FeedbackView profileId="pa" rideId="r1" send={send} />);
  fireEvent.click(screen.getByText('Genau richtig'));
  expect(send).toHaveBeenCalledWith({ type: 'feedback', profileId: 'pa', rideId: 'r1', rating: 'right' });
});
test('feedback can be skipped', () => {
  const send = vi.fn();
  render(<FeedbackView profileId="pa" rideId="r1" send={send} />);
  fireEvent.click(screen.getByText('Überspringen'));
  expect(send).toHaveBeenCalledWith({ type: 'skip-feedback', profileId: 'pa' });
});

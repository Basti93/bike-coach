// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { initialGymState } from '../../src/coach/gym/state';
import type { MobilityView } from '../../src/coach/mobility/mobility';
import { CoachView } from '../../src/ui/views/CoachView';
import { GymView } from '../../src/ui/views/GymView';
import { MobilityCard } from '../../src/ui/views/MobilityCard';

afterEach(cleanup);
beforeEach(() => localStorage.clear());
const session = { id: 'mobility-bike-5', forSession: 'bike' as const, minutes: 8, reason: 'Nach dem Radfahren eine kurze, ruhige Beweglichkeitseinheit, nur wenn du magst.', exercises: [
  { id: 'a', title: 'Waden an der Wand', howTo: 'Hände an die Wand.', area: 'waden' },
  { id: 'b', title: 'Brust im Türrahmen', howTo: 'Unterarm am Türrahmen.', area: 'brust' },
  { id: 'c', title: 'Kindhaltung', howTo: 'Gesäß Richtung Fersen.', area: 'ruecken' },
] };
const card = (mobility: MobilityView | null | undefined) => {
  const send = vi.fn();
  render(<MobilityCard profileId="p" mobility={mobility} send={send} />);
  return send;
};

test('shows the exercises with their descriptions and the minutes', () => {
  card({ session, askFeel: false });
  fireEvent.click(screen.getByRole('button', { name: 'Ansehen' }));
  for (const t of ['Waden an der Wand', 'Hände an die Wand.', 'Kindhaltung']) expect(screen.getByText(t)).toBeTruthy();
  expect(screen.getByText(/8 Minuten/)).toBeTruthy();
});
test('"Gemacht" sends the session id', () => {
  const send = card({ session, askFeel: false });
  fireEvent.click(screen.getByRole('button', { name: 'Gemacht' }));
  expect(send).toHaveBeenCalledWith({ type: 'mobility-done', profileId: 'p', sessionId: 'mobility-bike-5' });
});
test('skipping needs nothing: there is no skip button and no pressure text', () => {
  card({ session, askFeel: false });
  expect(screen.queryByRole('button', { name: /überspringen/i })).toBeNull();
  expect(document.body.textContent).not.toMatch(/musst|verpasst|Serie|streak/i);
});
test('nothing shows without a session or question', () => {
  card({ session: null, askFeel: false });
  expect(document.body.textContent).toBe('');
  cleanup();
  card(null);
  expect(document.body.textContent).toBe('');
});
test('the question can be answered or skipped', () => {
  const send = card({ session: null, askFeel: true });
  fireEvent.change(screen.getByLabelText(/beweglicher/i), { target: { value: ' Ja, etwas ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Antworten' }));
  expect(send).toHaveBeenCalledWith({ type: 'mobility-feel', profileId: 'p', text: 'Ja, etwas' });
  fireEvent.click(screen.getByRole('button', { name: 'Überspringen' }));
  expect(send).toHaveBeenLastCalledWith({ type: 'mobility-feel', profileId: 'p', text: '' });
});
test('an empty answer is not sent as an answer', () => {
  const send = card({ session: null, askFeel: true });
  fireEvent.click(screen.getByRole('button', { name: 'Antworten' }));
  expect(send).not.toHaveBeenCalled();
});

test('the bike page and the strength page both show it', () => {
  const profile = { id: 'p', name: 'Anna', ftpW: 150 };
  render(<CoachView profile={profile} state={null} thinking={false} coachConnected sendRide={vi.fn()} sendCoach={vi.fn()} mobility={{ session, askFeel: false }} />);
  expect(screen.getByText(/Beweglichkeit, wenn du magst/)).toBeTruthy();
  cleanup();
  const gym = { ready: true, thinking: false, hevy: false, complaints: [], hasHistory: true, state: initialGymState('p') };
  render(<GymView profileId="p" gym={gym} preview={null} previewFailed={false} result={null} send={vi.fn()} clear={vi.fn()} mobility={{ session, askFeel: false }} />);
  expect(screen.getByText(/Beweglichkeit, wenn du magst/)).toBeTruthy();
});

test('on both pages it sits below the next session, not above it', () => {
  const profile = { id: 'p', name: 'Anna', ftpW: 150 };
  const state = { profileId: 'p', ftpW: 150, ftpHistory: [], phase: { name: 'Aufbau', weeksLeft: 3, goal: 'x' }, ftpForecast: [], next: { session: { id: 'k', name: 'Locker', steps: [{ kind: 'erg' as const, durationS: 600, ftpFraction: 0.5, label: 'Warmup' }] }, reason: 'y', source: 'claude' }, changes: [], notes: [], feedback: {}, summaries: [], processedRides: [], awaitingFeedback: null, dirty: false, dirtySinceMs: null, lastError: null, lastAttemptMs: null } as never;
  render(<CoachView profile={profile} state={state} thinking={false} coachConnected sendRide={vi.fn()} sendCoach={vi.fn()} mobility={{ session, askFeel: false }} />);
  expect(screen.getByText('Los').compareDocumentPosition(screen.getByText(/Beweglichkeit, wenn du magst/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  cleanup();
  const next = { source: 'rules' as const, reason: 'r', workout: { name: 'Beine A', exercises: [{ templateId: 'squat', title: 'Kniebeuge', restS: 90, supersetId: null, notes: '', sets: [{ type: 'normal' as const, weightKg: 40, reps: 8 }] }] } };
  const gym = { ready: true, thinking: false, hevy: false, complaints: [], hasHistory: true, state: { ...initialGymState('p'), next } };
  render(<GymView profileId="p" gym={gym} preview={null} previewFailed={false} result={null} send={vi.fn()} clear={vi.fn()} mobility={{ session, askFeel: false }} />);
  expect(screen.getByRole('heading', { name: 'Beine A' }).compareDocumentPosition(screen.getByText(/Beweglichkeit, wenn du magst/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
test('"Heute nicht" hides it for today and sends nothing', () => {
  const send = card({ session, askFeel: false });
  fireEvent.click(screen.getByRole('button', { name: 'Heute nicht' }));
  expect(screen.queryByText(/Beweglichkeit/)).toBeNull();
  expect(send).not.toHaveBeenCalled();
});

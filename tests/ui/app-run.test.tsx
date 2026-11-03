// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TrackedRecord } from '../../src/shared/records';
import type { RunReviewBody, RunStatusBody } from '../../src/shared/run';
import { fakePort } from '../tracking/fake-port';
import { App } from '../../src/ui/App';

afterEach(() => { cleanup(); h.state = null; });

const h = vi.hoisted(() => ({ port: null as unknown, gym: null as unknown, state: null as unknown }));
vi.mock('../../src/ui/useCoach', () => ({ useCoach: () => ({ state: h.state, thinking: false, connected: true, send: () => {}, hevy: { state: 'idle' }, garmin: { state: 'idle' }, together: null, gym: h.gym, tracking: h.port, gymPreview: null, gymPreviewFailed: false, gymConfirmResult: null, clearGym: () => {} }) }));
vi.mock('../../src/ui/useRide', () => ({ useRide: () => ({
  state: { type: 'state', session: null, ride: null, engine: null, devices: {}, latest: {}, storageError: false, recovered: false, profiles: [{ id: 'a', name: 'Mia', ftpW: 200 }] },
  offer: null, clearOffer: () => {}, connected: true, send: () => {}, error: null,
}) }));

const rec = (id: string, body: object): TrackedRecord => ({ kind: 'run', id, updatedMs: 1, deleted: false, body });
const status = (over: Partial<RunStatusBody> = {}): RunStatusBody => ({
  type: 'status', atMs: 1, on: true, suggest: false, needsAnswers: false, garmin: false, suggestedDays: [1, 3, 5], hrCap: 150, complaint: null,
  numbers: { easyPace: { now: null, weeks4: null, weeks12: null, trend: [] }, weeks: [], longest: { blockKm: null, lastBlockKm: null }, tests: [] }, card: null, ...over,
});
const review: RunReviewBody = { type: 'review', week: '2026-10-26', atMs: 1, km: 12.5, minutes: 90, plannedMinutes: 90, runs: 3, longestKm: 6, easyPace: null, testM: null, focus: 'Ruhig weiter.' };

const pick = async () => { render(<App />); fireEvent.click(await screen.findByText('Mia')); };

test('without run records the menu has no Laufen', async () => {
  h.port = fakePort([]).port;
  await pick();
  await screen.findByRole('navigation', { name: 'Hauptmenü' });
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.queryByRole('button', { name: 'Laufen' })).toBeNull();
});

test('with a status on the menu has Laufen and the page writes through coach.tracking', async () => {
  const f = fakePort([rec('status', status({ needsAnswers: true }))]);
  h.port = f.port;
  await pick();
  fireEvent.click(await screen.findByRole('button', { name: 'Laufen' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(f.state.puts.some((p) => p.kind === 'run' && p.id === 'settings')).toBe(true));
});

test('the profile page shows the Laufen switch', async () => {
  h.port = fakePort([]).port;
  await pick();
  fireEvent.click(await screen.findByRole('button', { name: 'Profil' }));
  expect(await screen.findByRole('switch', { name: 'Laufen planen' })).toBeTruthy();
});

test('Verlauf shows the look back when a review exists', async () => {
  h.state = { profileId: 'a', summaries: [], ftpW: 200, ftpHistory: [], rules: [], changes: [], notes: [], phase: { name: 'Aufbau', description: '' } };
  h.port = fakePort([rec('status', status()), rec('review-2026-10-26', review)]).port;
  render(<App />);
  fireEvent.click(await screen.findByText('Mia'));
  fireEvent.click(await screen.findByRole('button', { name: 'Verlauf' }));
  expect(await screen.findByText('Wochenrückblick')).toBeTruthy();
});

test('the menu has Statistik with a stats record, and not without', async () => {
  h.port = fakePort([]).port;
  await pick();
  await screen.findByRole('navigation', { name: 'Hauptmenü' });
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.queryByRole('button', { name: 'Statistik' })).toBeNull();
  cleanup();
  h.port = fakePort([{ kind: 'stats', id: 'stats', updatedMs: 1, deleted: false, body: { type: 'stats', atMs: 1, goal: null, days: [], muscles: {} } }]).port;
  await pick();
  fireEvent.click(await screen.findByRole('button', { name: 'Statistik' }));
  expect(await screen.findByRole('heading', { name: 'Statistik' })).toBeTruthy();
});

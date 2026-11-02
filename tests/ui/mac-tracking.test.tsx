// @vitest-environment jsdom
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { handleRecords } from '../../src/coach/tracking/records-api';
import { RecordStore } from '../../src/coach/tracking/store';
import { createCoachTrackingPort } from '../../src/ui/coachTrackingPort';
import type { CoachClientMessage, CoachServerMessage } from '../../src/shared/coach-protocol';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import { initialGymState } from '../../src/coach/gym/state';
import { App } from '../../src/ui/App';

afterEach(cleanup);

const h = vi.hoisted(() => ({ gym: null as unknown, ride: false, port: null as unknown }));
vi.mock('../../src/ui/useCoach', () => ({ useCoach: () => ({ state: null, thinking: false, connected: true, send: () => {}, hevy: { state: 'idle' }, garmin: { state: 'idle' }, together: null, gym: h.gym, tracking: h.port, gymPreview: null, gymPreviewFailed: false, gymConfirmResult: null, clearGym: () => {} }) }));
vi.mock('../../src/ui/useRide', () => ({ useRide: () => ({
  state: {
    type: 'state', session: null, ride: h.ride ? { rideId: 'r', profileId: 'a', sessionId: 's', startedAtMs: 1, status: 'open' } : null,
    engine: h.ride ? { stepIndex: 0, stepRemainingS: 125, rideElapsedS: 10, targetW: 150, gradePct: null, gear: null, label: 'Warmup', nextLabel: 'Anstieg', secondsToNext: 125, autoReducedPct: 0, paused: false } : null,
    devices: {}, latest: {}, storageError: false, recovered: false, profiles: [{ id: 'a', name: 'Mia', ftpW: 200 }],
  },
  offer: null, clearOffer: () => {}, connected: true, send: () => {}, error: null,
}) }));

const wk = (over: Partial<LoggedWorkout> = {}): TrackedRecord => ({
  kind: 'workout', id: 'w1', updatedMs: 10, deleted: false,
  body: { id: 'w1', title: 'Beine', startMs: 1, endMs: null, source: 'pandafit', exercises: [], ...over, extra: 'bleibt' },
});

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-tracking-')); localStorage.clear(); h.ride = false; });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const gymSpy = () => ({ start: vi.fn(), workoutFinished: vi.fn() });

describe('server side', () => {
  test('a set reaches the store before the UI confirms', () => {
    const store = new RecordStore({ dir: tmp });
    const order: string[] = [];
    const put = store.put.bind(store);
    store.put = (p, r) => { put(p, r); order.push('stored'); };
    const out = handleRecords({ store, gym: gymSpy() }, { type: 'records-put', requestId: 'q1', profileId: 'a', record: wk() });
    order.push('answered');
    expect(order).toEqual(['stored', 'answered']);
    expect(out.reply).toEqual({ type: 'records-put-result', requestId: 'q1', ok: true });
    expect(store.all('a', 'workout')[0].body).toMatchObject({ extra: 'bleibt' });
    expect(out.changed).toBe('a');
  });

  test('a failing store answers not ok and announces no change', () => {
    const store = new RecordStore({ dir: tmp });
    store.put = () => { throw new Error('disk'); };
    const out = handleRecords({ store, gym: gymSpy() }, { type: 'records-put', requestId: 'q1', profileId: 'a', record: wk() });
    expect(out.reply).toEqual({ type: 'records-put-result', requestId: 'q1', ok: false });
    expect(out.changed).toBeUndefined();
  });

  test('a malformed record is refused', () => {
    const store = new RecordStore({ dir: tmp });
    const gym = gymSpy();
    const bad: unknown[] = [
      { ...wk(), kind: 'bogus' }, { ...wk(), id: 5 }, { ...wk(), id: '' }, { ...wk(), updatedMs: NaN }, { ...wk(), updatedMs: '1' },
      { ...wk(), deleted: 'no' }, { ...wk(), body: 'x'.repeat(1_000_001) }, null, 'text',
    ];
    for (const record of bad) {
      const out = handleRecords({ store, gym }, { type: 'records-put', requestId: 'q', profileId: 'a', record: record as TrackedRecord });
      expect(out.reply).toEqual({ type: 'records-put-result', requestId: 'q', ok: false, refused: true });
    }
    expect(store.all('a')).toEqual([]);
    expect(gym.start).not.toHaveBeenCalled();
    const noProfile = handleRecords({ store, gym }, { type: 'records-put', requestId: 'q', profileId: '', record: wk() });
    expect(noProfile.reply).toMatchObject({ ok: false, refused: true });
  });

  test('lists carry only that profile and kind', () => {
    const store = new RecordStore({ dir: tmp });
    store.put('a', wk());
    store.put('b', { ...wk(), id: 'other', body: {} });
    store.put('a', { kind: 'routine', id: 'r', updatedMs: 1, deleted: false, body: {} });
    const out = handleRecords({ store, gym: gymSpy() }, { type: 'records-list', requestId: 'l1', profileId: 'a', kind: 'workout' });
    expect(out.reply).toMatchObject({ type: 'records', kind: 'workout', requestId: 'l1' });
    expect((out.reply as Extract<CoachServerMessage, { type: 'records' }>).records.map((r) => r.id)).toEqual(['w1']);
    const unknown = handleRecords({ store, gym: gymSpy() }, { type: 'records-list', requestId: 'l2', profileId: 'a', kind: 'zzz' as never });
    expect((unknown.reply as Extract<CoachServerMessage, { type: 'records' }>).records).toEqual([]);
  });

  test('a finished workout marks the gym coach dirty, an open one only starts it', () => {
    const store = new RecordStore({ dir: tmp });
    const gym = gymSpy();
    handleRecords({ store, gym }, { type: 'records-put', requestId: 'q', profileId: 'a', record: wk() });
    expect(gym.start).toHaveBeenCalledWith('a');
    expect(gym.workoutFinished).not.toHaveBeenCalled();
    handleRecords({ store, gym }, { type: 'records-put', requestId: 'q', profileId: 'a', record: wk({ endMs: 99 }) });
    expect(gym.workoutFinished).toHaveBeenCalledWith('a');
    const routine: TrackedRecord = { kind: 'routine', id: 'r', updatedMs: 1, deleted: false, body: { endMs: 5 } };
    handleRecords({ store, gym }, { type: 'records-put', requestId: 'q', profileId: 'a', record: routine });
    expect(gym.workoutFinished).toHaveBeenCalledTimes(1);
  });
});

describe('port', () => {
  const rig = (opts: { up?: boolean; timeoutMs?: number } = {}) => {
    const sent: CoachClientMessage[] = [];
    const ctl = { up: opts.up ?? true };
    const port = createCoachTrackingPort({ profileId: 'a', send: (m) => { if (!ctl.up) return false; sent.push(m); return true; }, timeoutMs: opts.timeoutMs ?? 2000 });
    return { port, sent, ctl };
  };
  const putOf = (m: CoachClientMessage | undefined) => m as Extract<CoachClientMessage, { type: 'records-put' }>;
  const queued = () => JSON.parse(localStorage.getItem('pandafit.tracking.queue.a') ?? '[]') as { record: TrackedRecord }[];

  test('put resolves only after the Mac confirms', async () => {
    const { port, sent } = rig();
    let done = false;
    const p = port.put(wk()).then(() => { done = true; });
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    expect(done).toBe(false);
    port.handle({ type: 'records-put-result', requestId: putOf(sent[0]).requestId, ok: true });
    await p;
    expect(done).toBe(true);
    expect(queued()).toEqual([]);
  });

  test('a refused put rejects and is not queued', async () => {
    const { port, sent } = rig();
    const p = port.put(wk());
    port.handle({ type: 'records-put-result', requestId: putOf(sent[0]).requestId, ok: false });
    await expect(p).rejects.toThrow();
    expect(queued()).toEqual([]);
  });

  test('a lost socket queues puts in localStorage and replays them', async () => {
    const { port, sent, ctl } = rig({ up: false });
    await port.put(wk({ title: 'alt' }));
    await port.put({ ...wk({ title: 'neu' }), updatedMs: 20 });
    await port.put({ ...wk({ title: 'älter' }), updatedMs: 5 });
    await port.put({ kind: 'routine', id: 'r1', updatedMs: 1, deleted: false, body: {} });
    expect(queued().map((q) => [q.record.id, q.record.updatedMs])).toEqual([['w1', 20], ['r1', 1]]);
    expect(port.syncState().pending).toBe(2);
    // seen by a second port as well: survives a restart
    ctl.up = true;
    port.opened();
    expect(sent).toHaveLength(1);
    expect(putOf(sent[0]).record.id).toBe('w1');
    expect(queued()).toHaveLength(2); // not removed before the answer
    port.handle({ type: 'records-put-result', requestId: putOf(sent[0]).requestId, ok: true });
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(putOf(sent[1]).record.id).toBe('r1');
    expect(queued().map((q) => q.record.id)).toEqual(['r1']);
    port.handle({ type: 'records-put-result', requestId: putOf(sent[1]).requestId, ok: true });
    await waitFor(() => expect(queued()).toEqual([]));
    expect(port.syncState()).toMatchObject({ pending: 0 });
    expect(port.syncState().lastOkMs).not.toBeNull();
  });

  test('a queue from a previous start is replayed', async () => {
    localStorage.setItem('pandafit.tracking.queue.a', JSON.stringify([{ record: wk() }]));
    const { port, sent } = rig();
    port.opened();
    expect(putOf(sent[0]).record.id).toBe('w1');
  });

  test('a put without answer is kept and resolves', async () => {
    const { port } = rig({ timeoutMs: 20 });
    await port.put(wk());
    expect(queued()).toHaveLength(1);
  });

  test('the queue write failing rejects the put while offline', async () => {
    const { port } = rig({ up: false });
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('voll'); });
    await expect(port.put(wk())).rejects.toThrow();
    spy.mockRestore();
  });

  test('list answers come from the Mac, merged with unsent records, and subscribers hear changes', async () => {
    const { port, sent, ctl } = rig();
    const heard = vi.fn();
    port.subscribe(heard);
    const p = port.list('workout');
    const req = sent[0] as Extract<CoachClientMessage, { type: 'records-list' }>;
    port.handle({ type: 'records', kind: 'workout', requestId: req.requestId, records: [wk({ title: 'Mac' })] });
    expect((await p).map((r) => r.id)).toEqual(['w1']);
    ctl.up = false;
    await port.put({ ...wk({ title: 'lokal' }), updatedMs: 30 });
    expect(heard).toHaveBeenCalled();
    const offline = await port.list('workout');
    expect((offline[0].body as LoggedWorkout).title).toBe('lokal');
    heard.mockClear();
    port.handle({ type: 'records-changed', profileId: 'a' });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  test('a list without a socket or cache fails', async () => {
    const { port } = rig({ up: false });
    await expect(port.list('workout')).rejects.toThrow();
  });
});

describe('screen', () => {
  const gym = () => ({ ready: true, thinking: false, hevy: false, complaints: [], hasHistory: false, state: { ...initialGymState('a'), emptyReason: 'Noch nichts.' } });
  const portStub = () => ({ list: async () => [], put: async () => {}, subscribe: () => () => {}, syncState: () => ({ pending: 0, lastOkMs: null }) });

  test('Training starten opens the shared workout screen from the strength page', async () => {
    h.gym = gym(); h.port = portStub();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Mia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kraft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    expect(await screen.findByRole('button', { name: /Leeres Training|Training beginnen|Los geht/i })).toBeTruthy();
  });

  test('an open ride shows RideView and does not start planning from it', async () => {
    h.gym = gym(); h.port = portStub();
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Mia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kraft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    h.ride = true;
    rerender(<App />);
    expect(screen.getByTestId('target')).toBeTruthy();
    // opening or leaving a workout screen never asks the server to plan
    const store = new RecordStore({ dir: tmp });
    const g = gymSpy();
    handleRecords({ store, gym: g }, { type: 'records-put', requestId: 'q', profileId: 'a', record: wk() });
    expect(g.workoutFinished).not.toHaveBeenCalled();
  });

  test('losing gym ends the workout screen', async () => {
    h.gym = gym(); h.port = portStub();
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Mia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kraft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    h.gym = null;
    rerender(<App />);
    h.gym = gym();
    rerender(<App />);
    expect(screen.queryByRole('button', { name: 'Training starten' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Kraft' })).toBeNull();
  });
});

test('tracking.css does not collide with the app styles', () => {
  const t = fs.readFileSync(path.resolve('src/tracking/ui/tracking.css'), 'utf8');
  const app = fs.readFileSync(path.resolve('src/ui/style.css'), 'utf8');
  const classes = new Set([...t.matchAll(/\.(tk-[a-z-]+)/g)].map((m) => m[1]));
  for (const c of classes) expect(app.includes(`.${c}`), c).toBe(false);
  // every rule of tracking.css is scoped to a tk- class or a media query
  const selectors = t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => /^[^\s@}]/.test(l)).map((l) => l.trim());
  for (const l of selectors) expect(l.startsWith('.tk-'), l).toBe(true);
});

// @vitest-environment jsdom
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { handleRecords } from '../../src/coach/tracking/records-api';
import { RecordStore } from '../../src/coach/tracking/store';
import { createCoachTrackingPort, createTrackingPorts } from '../../src/ui/coachTrackingPort';
import type { CoachClientMessage, CoachServerMessage } from '../../src/shared/coach-protocol';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import { initialGymState } from '../../src/coach/gym/state';
import { fakePort } from '../tracking/fake-port';
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

const profiles = () => ['a'];
const gymSpy = () => ({ start: vi.fn(), workoutFinished: vi.fn() });

describe('server side', () => {
  test('a set reaches the store before the UI confirms', () => {
    const store = new RecordStore({ dir: tmp });
    const order: string[] = [];
    const put = store.put.bind(store);
    store.put = (p, r, seen) => { const res = put(p, r, seen); order.push('stored'); return res; };
    const out = handleRecords({ store, gym: gymSpy(), profiles }, { type: 'records-put', requestId: 'q1', profileId: 'a', record: wk() });
    order.push('answered');
    expect(order).toEqual(['stored', 'answered']);
    expect(out.reply).toEqual({ type: 'records-put-result', requestId: 'q1', ok: true, kept: true, updatedMs: wk().updatedMs });
    expect(store.all('a', 'workout')[0].body).toMatchObject({ extra: 'bleibt' });
    expect(out.changed).toBe('a');
  });

  test('a failing store answers not ok and announces no change', () => {
    const store = new RecordStore({ dir: tmp });
    store.put = () => { throw new Error('disk'); };
    const out = handleRecords({ store, gym: gymSpy(), profiles }, { type: 'records-put', requestId: 'q1', profileId: 'a', record: wk() });
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
      const out = handleRecords({ store, gym, profiles }, { type: 'records-put', requestId: 'q', profileId: 'a', record: record as TrackedRecord });
      expect(out.reply).toEqual({ type: 'records-put-result', requestId: 'q', ok: false, refused: true });
    }
    expect(store.all('a')).toEqual([]);
    expect(gym.start).not.toHaveBeenCalled();
    const noProfile = handleRecords({ store, gym, profiles }, { type: 'records-put', requestId: 'q', profileId: '', record: wk() });
    expect(noProfile.reply).toMatchObject({ ok: false, refused: true });
  });

  test('lists carry only that profile and kind', () => {
    const store = new RecordStore({ dir: tmp });
    store.put('a', wk());
    store.put('b', { ...wk(), id: 'other', body: {} });
    store.put('a', { kind: 'routine', id: 'r', updatedMs: 1, deleted: false, body: {} });
    const out = handleRecords({ store, gym: gymSpy(), profiles }, { type: 'records-list', requestId: 'l1', profileId: 'a', kind: 'workout' });
    expect(out.reply).toMatchObject({ type: 'records', kind: 'workout', requestId: 'l1' });
    expect((out.reply as Extract<CoachServerMessage, { type: 'records' }>).records.map((r) => r.id)).toEqual(['w1']);
    const unknown = handleRecords({ store, gym: gymSpy(), profiles }, { type: 'records-list', requestId: 'l2', profileId: 'a', kind: 'zzz' as never });
    expect((unknown.reply as Extract<CoachServerMessage, { type: 'records' }>).records).toEqual([]);
  });

  test('a finished workout marks the gym coach dirty, an open one only starts it', () => {
    const store = new RecordStore({ dir: tmp });
    const gym = gymSpy();
    handleRecords({ store, gym, profiles }, { type: 'records-put', requestId: 'q', profileId: 'a', record: wk() });
    expect(gym.start).toHaveBeenCalledWith('a');
    expect(gym.workoutFinished).not.toHaveBeenCalled();
    handleRecords({ store, gym, profiles }, { type: 'records-put', requestId: 'q', profileId: 'a', record: { ...wk({ endMs: 99 }), updatedMs: 20 } });
    expect(gym.workoutFinished).toHaveBeenCalledWith('a');
    const routine: TrackedRecord = { kind: 'routine', id: 'r', updatedMs: 1, deleted: false, body: { endMs: 5 } };
    handleRecords({ store, gym, profiles }, { type: 'records-put', requestId: 'q', profileId: 'a', record: routine });
    expect(gym.workoutFinished).toHaveBeenCalledTimes(1);
  });
});

describe('server rules', () => {
  test('a finished workout plans once, not on edits or replays', () => {
    const store = new RecordStore({ dir: tmp });
    const gym = gymSpy();
    const put = (r: TrackedRecord) => handleRecords({ store, gym, profiles }, { type: 'records-put', requestId: 'q', profileId: 'a', record: r });
    put(wk());
    put({ ...wk({ endMs: 99 }), updatedMs: 20 });
    expect(gym.workoutFinished).toHaveBeenCalledTimes(1);
    put({ ...wk({ endMs: 99, title: 'geändert' }), updatedMs: 30 });
    put({ ...wk({ endMs: 99 }), updatedMs: 20 });
    put(wk());
    expect(gym.workoutFinished).toHaveBeenCalledTimes(1);
  });

  test('an unknown profile is refused and no file is created', () => {
    const store = new RecordStore({ dir: path.join(tmp, 'tracking') });
    const gym = gymSpy();
    const out = handleRecords({ store, gym, profiles }, { type: 'records-put', requestId: 'q', profileId: '../evil', record: wk() });
    expect(out.reply).toEqual({ type: 'records-put-result', requestId: 'q', ok: false, refused: true });
    expect(out.changed).toBeUndefined();
    const list = handleRecords({ store, gym, profiles }, { type: 'records-list', requestId: 'l', profileId: 'zz', kind: 'workout' });
    expect((list.reply as { records: unknown[] }).records).toEqual([]);
    expect(fs.existsSync(path.join(tmp, 'tracking'))).toBe(false);
    expect(gym.start).not.toHaveBeenCalled();
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

  test('a refused record on replay is kept apart and shown, and the queue goes on', async () => {
    localStorage.setItem('pandafit.tracking.queue.a', JSON.stringify([{ record: wk() }, { record: { ...wk(), id: 'w2' } }]));
    const { port, sent } = rig();
    port.opened();
    port.handle({ type: 'records-put-result', requestId: putOf(sent[0]).requestId, ok: false, refused: true });
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(JSON.parse(localStorage.getItem('pandafit.tracking.refused.a')!).map((e: { record: TrackedRecord }) => e.record.id)).toEqual(['w1']);
    expect(queued().map((q) => q.record.id)).toEqual(['w2']);
    expect(port.syncState()).toMatchObject({ refused: 1 });
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

describe('port lifetime', () => {
  const putOf = (m: CoachClientMessage | undefined) => m as Extract<CoachClientMessage, { type: 'records-put' }>;
  test('after a profile switch the old port still delivers under its own profile', async () => {
    const sent: CoachClientMessage[] = [];
    const ctl = { up: false };
    const ports = createTrackingPorts({ send: (m) => { if (!ctl.up) return false; sent.push(m); return true; }, timeoutMs: 2000 });
    const a = ports.get('a');
    ports.get('b'); // the rider switched profile
    expect(ports.get('a')).toBe(a);
    await a.put(wk());
    ctl.up = true;
    ports.opened();
    expect(putOf(sent[0]).profileId).toBe('a');
    ports.handle({ type: 'records-put-result', requestId: putOf(sent[0]).requestId, ok: true });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('pandafit.tracking.queue.a')!)).toEqual([]));
    ports.dispose();
  });

  test('a waiting queue is retried on a timer', async () => {
    vi.useFakeTimers();
    try {
      const sent: CoachClientMessage[] = [];
      const ctl = { up: false };
      const ports = createTrackingPorts({ send: (m) => { if (!ctl.up) return false; sent.push(m); return true; }, timeoutMs: 2000 });
      await ports.get('a').put(wk());
      ctl.up = true;
      await vi.advanceTimersByTimeAsync(15_000);
      expect(sent).toHaveLength(1);
      ports.dispose();
    } finally { vi.useRealTimers(); }
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
    expect(await screen.findByRole('heading', { name: 'Training starten' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leeres Training starten' })).toBeTruthy();
  });

  test('returning from a ride brings back the same in-progress workout', async () => {
    const open: TrackedRecord = { kind: 'workout', id: 'open1', updatedMs: 5, deleted: false, body: { id: 'open1', title: 'Zuhause', startMs: 1000, endMs: null, source: 'pandafit', exercises: [{ exerciseId: 'pf-bench-press', title: 'Bankdrücken', supersetId: null, notes: '', sets: [{ type: 'normal', weightKg: 62.5, reps: 8, durationS: null, doneMs: null }] }] } };
    const fp = fakePort([open]);
    h.gym = gym(); h.port = fp.port;
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Mia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kraft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Weitermachen' }));
    expect(((await screen.findByLabelText('Gewicht Satz 1')) as HTMLInputElement).value).toBe('62,5');
    h.ride = true;
    rerender(<App />);
    expect(screen.getByTestId('target')).toBeTruthy();
    h.ride = false;
    rerender(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Weitermachen' }));
    expect(((await screen.findByLabelText('Gewicht Satz 1')) as HTMLInputElement).value).toBe('62,5');
    expect(fp.map.size).toBe(1);
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
    handleRecords({ store, gym: g, profiles }, { type: 'records-put', requestId: 'q', profileId: 'a', record: wk() });
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

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { RecordStore } from '../../src/coach/tracking/store';
import { AccountLinks } from '../../src/coach/tracking/link';
import { AccountSync } from '../../src/coach/tracking/mac-sync';
import { GymCoach } from '../../src/coach/gym/gym-coach';
import { dedupeSessions } from '../../src/shared/history';
import { lastValues } from '../../src/tracking/session';
import { createWorkoutStore } from '../../src/tracking/store';
import { openIdb } from '../../src/web/idbStore';
import { createWebPort } from '../../src/web/webPort';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import { PW_A, setup } from '../web-server/helpers';

let app: FastifyInstance | null = null;
afterEach(async () => { await app?.close(); app = null; });

const wk = (sets: number, over: Partial<LoggedWorkout> = {}) => ({
  id: 'w1', title: 'Beine', startMs: 1000, endMs: null as number | null, source: 'pandafit' as const, rest: null,
  exercises: [{ rid: 'e', exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: Array.from({ length: sets }, (_, i) => ({ rid: `s${i}`, type: 'normal' as const, weightKg: 60, reps: 8, durationS: null, doneMs: 2000 + i })) }],
  ...over,
});
const rec = (sets: number, updatedMs: number, over: Partial<TrackedRecord> = {}): TrackedRecord => ({ kind: 'workout', id: 'w1', updatedMs, deleted: false, body: wk(sets), ...over });
const setsOf = (r: TrackedRecord) => (r.body as LoggedWorkout).exercises.flatMap((e) => e.sets).length;

type Flaky = { failNext: ((url: string, method: string) => boolean) | null };
const browser = (a: FastifyInstance, flaky: Flaky) => {
  let cookie = '';
  return (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (flaky.failNext?.(url, method)) { flaky.failNext = null; throw new Error('offline'); }
    const res = await a.inject({
      method: method as 'GET' | 'POST', url,
      headers: { host: 'pf.test', origin: 'http://pf.test', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      payload: init.body as string | undefined,
    });
    const set = /pf_session=[0-9a-f]*/.exec(String(res.headers['set-cookie']))?.[0];
    if (set) cookie = set.endsWith('=') ? '' : set;
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
};

async function phone(a: FastifyInstance, now: () => number, flaky: Flaky = { failNext: null }) {
  const fetchFn = browser(a, flaky);
  await fetchFn('/login', { method: 'POST', body: JSON.stringify({ name: 'anna', password: PW_A }) });
  const store = await openIdb('anna', new IDBFactory());
  const port = createWebPort({ store, account: 'anna', fetchFn, now, events: new EventTarget(), intervalMs: 1e9 });
  return {
    flaky, store, port, sync: () => port.sync(),
    write: async (r: TrackedRecord) => { await port.put(r); },
    all: async () => store.list('workout'),
    stop: () => port.dispose(),
  };
}

async function mac(a: FastifyInstance, now: () => number, flaky: Flaky = { failNext: null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-mac-'));
  const store = new RecordStore({ dir: path.join(dir, 'tracking') });
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const u = String(url).replace('http://localhost', '');
    const method = init.method ?? 'GET';
    if (flaky.failNext?.(u, method)) { flaky.failNext = null; throw new Error('offline'); }
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as Record<string, string>) };
    const res = await a.inject({ method: method as 'GET' | 'POST', url: u, headers, payload: init.body as string | undefined });
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  let offset = 0;
  const links = new AccountLinks({ dir: path.join(dir, 'accounts'), fetchFn });
  await links.link('p', 'http://localhost', 'anna', PW_A);
  const finished: string[] = [];
  const sync = new AccountSync({
    links, store, nowMs: () => now() + offset, fetchFn, noOpenRide: () => true,
    coach: { state: () => ({ complaints: [] }), addComplaintFromText() {}, updateComplaint() {} } as never,
    gym: { state: () => ({ next: null }), enabled: () => false, start() {}, workoutFinished: (id: string) => { finished.push(id); } } as never,
    mobility: { view: () => ({ session: null, askFeel: false }) } as never,
  });
  return {
    flaky, store, finished,
    sync: async () => { offset += 61_000; await sync.tick('p'); },
    write: async (r: TrackedRecord) => { store.put('p', r); },
    all: async () => store.all('p', 'workout'),
    stop: () => {},
  };
}
type Side = { sync: () => Promise<unknown>; write: (r: TrackedRecord) => Promise<void>; all: () => Promise<TrackedRecord[]>; stop: () => void; flaky: Flaky };
const sides = (a: FastifyInstance, now: () => number) => ({ phone: () => phone(a, now), mac: () => mac(a, now) });

const live = (rs: TrackedRecord[]) => rs.filter((r) => !r.deleted);
const copies = (rs: TrackedRecord[]) => rs.filter((r) => r.id !== 'w1');

/** The device holding unsent work and the other one, in both directions. */
describe.each([['phone holds the sets, Mac wins', 'phone', 'mac'], ['Mac holds the sets, phone wins', 'mac', 'phone']] as const)('%s', (_n, holderKind, otherKind) => {
  const start = async () => {
    const s = await setup();
    app = s.app;
    const make = sides(app, () => s.clock.now);
    const holder = (await make[holderKind]()) as unknown as Side;
    const other = (await make[otherKind]()) as unknown as Side;
    // Started with signal: the empty workout reaches the server and the other device.
    await holder.write(rec(0, 10));
    await holder.sync();
    await other.sync();
    expect((await other.all()).map((r) => r.id)).toEqual(['w1']);
    // Dead spot: 20 confirmed sets stay on the holder.
    await holder.write(rec(20, 20));
    return { s, holder, other };
  };
  const server = (dbPath: string) => { const o = new DatabaseSync(dbPath); const rows = o.prepare('SELECT id, updated_ms AS u, body FROM overwritten').all() as { id: string; u: number; body: string }[]; o.close(); return rows; };

  it('S1 tombstone: the 20 sets stay visible as one finished copy everywhere', async () => {
    const { s, holder, other } = await start();
    const macRec = (await other.all())[0]!;
    await other.write({ ...macRec, updatedMs: 30, deleted: true });
    await other.sync();
    await holder.sync();
    await other.sync();
    for (const side of [holder, other]) {
      const all = await side.all();
      expect(all.find((r) => r.id === 'w1')?.deleted).toBe(true);
      const kept = copies(all);
      expect(kept).toHaveLength(1);
      expect(kept[0]!.deleted).toBe(false);
      expect(setsOf(kept[0]!)).toBe(20);
      const body = kept[0]!.body as LoggedWorkout;
      expect(body.id).toBe(kept[0]!.id);
      expect(body.endMs).toBe(2019);
      expect(body.title).toBe('Beine (aufbewahrte Kopie von einem anderen Gerät)');
    }
    // The server keeps the loser too: the send comes first.
    expect(server(s.dbPath).some((r) => r.u === 20 && JSON.parse(r.body).exercises[0].sets.length === 20)).toBe(true);
    holder.stop(); other.stop();
  });

  it('a later edit with fewer sets: same copy, and the edit stays the record', async () => {
    const { holder, other } = await start();
    const r = (await other.all())[0]!;
    await other.write({ ...r, updatedMs: 30, body: wk(1) });
    await other.sync();
    await holder.sync();
    await other.sync();
    for (const side of [holder, other]) {
      const all = await side.all();
      expect(setsOf(all.find((x) => x.id === 'w1')!)).toBe(1);
      expect(copies(all).map(setsOf)).toEqual([20]);
    }
    holder.stop(); other.stop();
  });

  it('a loser with no more sets than the winner gives no copy', async () => {
    const { holder, other } = await start();
    const r = (await other.all())[0]!;
    await other.write({ ...r, updatedMs: 30, body: wk(20) });
    await other.sync();
    await holder.sync();
    await other.sync();
    for (const side of [holder, other]) expect(await side.all()).toHaveLength(1);
    holder.stop(); other.stop();
  });

  it('a retry after a failure in the middle of the run gives one copy, with no duplicate kept row', async () => {
    for (const failing of [
      (u: string, m: string) => m === 'POST' && u === '/records',
      (u: string, m: string) => m === 'GET' && u.startsWith('/records'),
    ]) {
      const { s, holder, other } = await start();
      const r = (await other.all())[0]!;
      await other.write({ ...r, updatedMs: 30, deleted: true });
      await other.sync();
      holder.flaky.failNext = failing;
      await holder.sync();
      await holder.sync();
      await holder.sync();
      await other.sync();
      for (const side of [holder, other]) expect(copies(await side.all()).map(setsOf)).toEqual([20]);
      expect(server(s.dbPath).filter((x) => x.u === 20)).toHaveLength(1);
      holder.stop(); other.stop();
      await app?.close(); app = null;
    }
  });

  it('a failure after the first page keeps what is done, and a later send fails then works: copy reaches the other device', async () => {
    const { holder, other } = await start();
    const r = (await other.all())[0]!;
    await other.write({ ...r, updatedMs: 30, deleted: true });
    await other.sync();
    let posts = 0;
    holder.flaky.failNext = (u, m) => m === 'POST' && u === '/records' && ++posts === 2; // the first POST goes, the copy's fails
    await holder.sync();
    expect(copies(await holder.all()).map(setsOf)).toEqual([20]);
    holder.flaky.failNext = null;
    await holder.sync();
    await other.sync();
    expect(copies(await other.all()).map(setsOf)).toEqual([20]);
    holder.stop(); other.stop();
  });
});

describe('the kept copy in the history', () => {
  const lost = rec(20, 20);
  const copy = async () => {
    const s = await setup();
    app = s.app;
    const a = await phone(s.app, () => s.clock.now), b = await phone(s.app, () => s.clock.now);
    await a.write(rec(0, 10)); await a.sync(); await b.sync();
    await a.write(lost);
    await b.write(rec(1, 30, { body: wk(1, { endMs: 9000 }) })); await b.sync();
    await a.sync();
    const all = await a.all();
    a.stop(); b.stop();
    return all;
  };

  it('stays visible next to the winner, never open, and counts as one session', async () => {
    const all = await copy();
    const bodies = all.map((r) => r.body as LoggedWorkout);
    // Visible: both are in the list the history screen draws.
    expect(dedupeSessions(bodies)).toHaveLength(2);
    // Never the open workout.
    expect(bodies.filter((w) => w.endMs === null)).toEqual([]);
    // Last values come from the session with the most sets, once.
    expect(lastValues('pf-squat', bodies)).toHaveLength(20);
  });

  it('the merged history counts the session once, with its full sets, and a Hevy overlap is not added', async () => {
    const all = await copy();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-gym-'));
    const store = new RecordStore({ dir: path.join(dir, 'tracking') });
    store.putMany('p', all);
    const gym = new GymCoach({
      dir: path.join(dir, 'gym'), nowMs: () => 1e9, ask: async () => ({}), store,
      workouts: () => [{ id: 'hv', title: 'Hevy', startMs: 1000, durationS: 8, exercises: [] }], templates: async () => [], refreshTemplates: async () => [],
      ready: () => true, bike: () => ({ summaries: [], complaints: [] }), complaint() {}, writer: () => null, hevy: () => true,
    });
    const h = gym.history('p');
    expect(h).toHaveLength(1);
    expect(h[0]!.exercises[0]!.workSets).toHaveLength(20);
  });

  it('a copy of an open workout with its unconfirmed sets dropped holds only what was confirmed', async () => {
    const s = await setup();
    app = s.app;
    const a = await phone(s.app, () => s.clock.now), b = await phone(s.app, () => s.clock.now);
    await a.write(rec(0, 10)); await a.sync(); await b.sync();
    const w = wk(3);
    w.exercises[0]!.sets[2]!.doneMs = null as never;
    await a.write(rec(0, 20, { body: w }));
    await b.write(rec(0, 30, { deleted: true })); await b.sync();
    await a.sync();
    expect(copies(await a.all()).map(setsOf)).toEqual([2]);
    a.stop(); b.stop();
  });

  it('after being deleted by hand, a retry does not bring the copy back', async () => {
    const s = await setup();
    app = s.app;
    const a = await phone(s.app, () => s.clock.now), b = await phone(s.app, () => s.clock.now);
    await a.write(rec(0, 10)); await a.sync(); await b.sync();
    await a.write(lost);
    await b.write(rec(0, 30, { deleted: true })); await b.sync();
    await a.sync();
    const c = copies(await a.all())[0]!;
    const store = createWorkoutStore(a.port, c, () => s.clock.now);
    await store.remove();
    store.dispose();
    await a.sync(); await b.sync();
    expect(live(await b.all())).toEqual([]);
    a.stop(); b.stop();
  });
});

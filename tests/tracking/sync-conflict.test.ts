import 'fake-indexeddb/auto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { RecordStore } from '../../src/coach/tracking/store';
import { GymCoach } from '../../src/coach/gym/gym-coach';
import { dedupeSessions } from '../../src/shared/history';
import { lastValues } from '../../src/tracking/session';
import { createWorkoutStore } from '../../src/tracking/store';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import { setup } from '../web-server/helpers';
import { phone, rec, setsOf, sides, wk, type Side } from './two-devices';


let app: FastifyInstance | null = null;
afterEach(async () => { await app?.close(); app = null; });

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

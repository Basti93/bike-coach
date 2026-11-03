import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { RecordStore } from '../../src/coach/tracking/store';
import { AccountLinks } from '../../src/coach/tracking/link';
import { AccountSync } from '../../src/coach/tracking/mac-sync';
import { openIdb } from '../../src/web/idbStore';
import { createWebPort } from '../../src/web/webPort';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import { PW_A } from '../web-server/helpers';

export const wk = (sets: number, over: Partial<LoggedWorkout> = {}) => ({
  id: 'w1', title: 'Beine', startMs: 1000, endMs: null as number | null, source: 'pandafit' as const, rest: null,
  exercises: [{ rid: 'e', exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: Array.from({ length: sets }, (_, i) => ({ rid: `s${i}`, type: 'normal' as const, weightKg: 60, reps: 8, durationS: null, doneMs: 2000 + i })) }],
  ...over,
});
export const rec = (sets: number, updatedMs: number, over: Partial<TrackedRecord> = {}): TrackedRecord => ({ kind: 'workout', id: 'w1', updatedMs, deleted: false, body: wk(sets), ...over });
export const setsOf = (r: TrackedRecord) => (r.body as LoggedWorkout).exercises.flatMap((e) => e.sets).length;

export type Flaky = { failNext: ((url: string, method: string) => boolean) | null };
export const browser = (a: FastifyInstance, flaky: Flaky) => {
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

export async function phone(a: FastifyInstance, now: () => number, flaky: Flaky = { failNext: null }) {
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

export async function mac(a: FastifyInstance, now: () => number, flaky: Flaky = { failNext: null }) {
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
    flaky, store, finished, links,
    sync: async () => { offset += 61_000; await sync.tick('p'); },
    write: async (r: TrackedRecord) => { store.put('p', r); },
    all: async () => store.all('p', 'workout'),
    stop: () => {},
  };
}
export type Side = { sync: () => Promise<unknown>; write: (r: TrackedRecord) => Promise<void>; all: () => Promise<TrackedRecord[]>; stop: () => void; flaky: Flaky };
export const sides = (a: FastifyInstance, now: () => number) => ({ phone: () => phone(a, now), mac: () => mac(a, now) });


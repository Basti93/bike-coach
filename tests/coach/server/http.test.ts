import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, vi } from 'vitest';
import WebSocket from 'ws';
import { Household } from '../../../src/coach/server/household';
import { buildCoachServer } from '../../../src/coach/server/http';
import type { CoachServerMessage } from '../../../src/shared/coach-protocol';
import type { Profile } from '../../../src/shared/profiles';
import { DEFAULT_MEAL_SETTINGS } from '../../../src/shared/meals';

const KEY = Buffer.alloc(32, 7);
const TOKEN = 'b'.repeat(64);
const HEVY_KEY = '12345678-1234-1234-1234-123456789abc';
const NOON = new Date(2026, 10, 3, 12, 0).getTime();
const P1: Profile = { id: 'pa', name: 'A', ftpW: 200 };
const P2: Profile = { id: 'pb', name: 'B', ftpW: 180 };
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cs-'));
const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

const seedAccount = (root: string, id: number, profile: Profile, moved = true) => {
  const dir = path.join(root, 'accounts', String(id));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(profile));
  if (moved) fs.writeFileSync(path.join(dir, 'moved.json'), JSON.stringify({ atMs: 1 }));
  return dir;
};

type Conn = { ws: WebSocket; frames: CoachServerMessage[]; raw: string[]; closed: Promise<number>; opened: Promise<void> };

let app: FastifyInstance | null = null;
let conns: Conn[] = [];
beforeEach(() => {
  // The records sync to the api: an empty, friendly api.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ records: [], cursor: 0, more: false, refused: [] }), { status: 200, headers: { 'content-type': 'application/json' } })));
});
afterEach(async () => {
  for (const c of conns) c.ws.terminate();
  conns = [];
  await app?.close();
  app = null;
  vi.unstubAllGlobals();
});

const start = async (o: { accounts?: [number, Profile, boolean?][]; now?: { ms: number }; meals?: boolean } = {}) => {
  const root = temp();
  for (const [id, p, moved] of o.accounts ?? [[1, P1], [2, P2]]) seedAccount(root, id, p, moved !== false);
  if (o.meals) {
    const dir = path.join(root, 'household', 'meals');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'household.json'), JSON.stringify({ settings: { pa: { ...DEFAULT_MEAL_SETTINGS, on: true }, pb: { ...DEFAULT_MEAL_SETTINGS, on: true } }, plans: {}, states: {}, notices: {}, lastAuto: null }));
    fs.writeFileSync(path.join(dir, 'moved.json'), JSON.stringify({ atMs: 1 }));
  }
  const clock = o.now ?? { ms: NOON };
  const ask = vi.fn(async (): Promise<unknown> => { throw new Error('no Claude in tests'); });
  const hevyFetch = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const household = new Household({
    root, secretKey: KEY, runDir: temp(), python: process.execPath, garminScripts: path.join(root, 'scripts'),
    apiUrl: 'http://api.test:8081', internalToken: TOKEN, ask, nowMs: () => clock.ms,
    spawnFn: vi.fn(() => { throw new Error('no python in tests'); }) as never, fetchFn: hevyFetch as never, waitMs: 0,
  });
  app = buildCoachServer({ household, internalToken: TOKEN, nowMs: () => clock.ms });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  const connect = (headers: Record<string, string>): Conn => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
    const frames: CoachServerMessage[] = [];
    const raw: string[] = [];
    ws.on('message', (d) => { raw.push(String(d)); frames.push(JSON.parse(String(d)) as CoachServerMessage); });
    const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
    const opened = new Promise<void>((r) => ws.on('open', () => r()));
    ws.on('error', () => {});
    const c = { ws, frames, raw, closed, opened };
    conns.push(c);
    return c;
  };
  const as = async (accountId: number): Promise<Conn> => {
    const c = connect({ 'x-pandafit-internal': TOKEN, 'x-pandafit-account': String(accountId) });
    await c.opened;
    return c;
  };
  const send = (c: Conn, m: unknown) => c.ws.send(JSON.stringify(m));
  return { root, household, clock, ask, hevyFetch, connect, as, send };
};

const states = (c: Conn) => c.frames.filter((f): f is Extract<CoachServerMessage, { type: 'coach-state' }> => f.type === 'coach-state');

test('without the internal token every route but /healthz answers 401 and the socket closes with 4401', async () => {
  const t = await start();
  expect((await app!.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({ ok: true });
  for (const headers of [{}, { 'x-pandafit-account': '1' }, { 'x-pandafit-internal': 'c'.repeat(64), 'x-pandafit-account': '1' }, { 'x-pandafit-internal': TOKEN }, { 'x-pandafit-internal': TOKEN, 'x-pandafit-account': '1.5' }, { 'x-pandafit-internal': TOKEN, 'x-pandafit-account': 'abc' }]) {
    expect((await app!.inject({ method: 'GET', url: '/status', headers })).statusCode).toBe(401);
    expect((await app!.inject({ method: 'GET', url: '/nothing-here', headers })).statusCode).toBe(401);
  }
  // Counts only with the token.
  expect((await app!.inject({ method: 'GET', url: '/healthz?counts=1' })).statusCode).toBe(401);
  const bad: Record<string, string>[] = [{}, { 'x-pandafit-account': '1' }, { 'x-pandafit-internal': 'c'.repeat(64), 'x-pandafit-account': '1' }, { 'x-pandafit-internal': TOKEN, 'x-pandafit-account': 'abc' }];
  for (const headers of bad) {
    expect(await t.connect(headers).closed).toBe(4401);
  }
  const ok = await app!.inject({ method: 'GET', url: '/status', headers: { 'x-pandafit-internal': TOKEN, 'x-pandafit-account': '1' } });
  expect(ok.json()).toEqual({ profileId: 'pa', moved: true });
});

test('a socket for an account that has not moved closes with 4404', async () => {
  const t = await start({ accounts: [[1, P1], [3, { id: 'pc', name: 'C', ftpW: 150 }, false]] });
  expect(await t.connect({ 'x-pandafit-internal': TOKEN, 'x-pandafit-account': '3' }).closed).toBe(4404);
  expect(await t.connect({ 'x-pandafit-internal': TOKEN, 'x-pandafit-account': '9' }).closed).toBe(4404);
  const status = async (account: string) => (await app!.inject({ method: 'GET', url: '/status', headers: { 'x-pandafit-internal': TOKEN, 'x-pandafit-account': account } })).json();
  // Account 3 is bound to its profile (its move has begun) but has not moved.
  expect(await status('3')).toEqual({ profileId: 'pc', moved: false });
  expect(await status('9')).toEqual({ profileId: null, moved: false });
});

test('subscribe with the account\'s profile id answers coach-state with profile', async () => {
  const t = await start();
  const c = await t.as(1);
  t.send(c, { type: 'subscribe', profileId: 'pa' });
  await vi.waitFor(() => expect(states(c).length).toBeGreaterThan(0));
  const s = states(c)[0]!;
  expect(s.state.profileId).toBe('pa');
  expect(s.profile).toEqual({ ...P1, ftpW: s.state.ftpW });
});

test('a message for another profile id is refused and changes nothing', async () => {
  const t = await start();
  const c1 = await t.as(1), c2 = await t.as(2);
  t.household.account(2)!.runtime.handle({ type: 'subscribe', profileId: 'pb' }, () => {});
  const before = JSON.stringify(t.household.account(2)!.runtime.coachState('pb')!.notes);
  t.send(c1, { type: 'note', profileId: 'pb', text: 'fremde Notiz' });
  t.send(c1, { type: 'subscribe', profileId: 'pb' });
  t.send(c1, { type: 'queued', atMs: NOON, message: { type: 'note', profileId: 'pb', text: 'fremde Notiz' } });
  t.send(c1, { type: 'profile-update', profileId: 'pb', profile: { ...P1, name: 'Fremd' } });
  await settle();
  expect(t.household.account(1)!.profile().name).toBe('A');
  expect(t.household.account(2)!.profile().name).toBe('B');
  expect(JSON.stringify(t.household.account(2)!.runtime.coachState('pb')!.notes)).toBe(before);
  expect(c1.frames).toEqual([]);
  expect(c2.frames).toEqual([]);
});

test('a socket of account 2 never receives account 1\'s coach-state', async () => {
  const t = await start();
  const c1 = await t.as(1), c2 = await t.as(2);
  t.send(c1, { type: 'subscribe', profileId: 'pa' });
  t.send(c2, { type: 'subscribe', profileId: 'pb' });
  await vi.waitFor(() => expect(states(c2).length).toBeGreaterThan(0));
  t.send(c1, { type: 'note', profileId: 'pa', text: 'Notiz nur für eins' });
  await vi.waitFor(() => expect(JSON.stringify(states(c1))).toContain('Notiz nur für eins'));
  t.household.scan();
  await settle();
  expect(states(c2).every((s) => s.state.profileId === 'pb' && s.profile?.id === 'pb')).toBe(true);
  expect(c2.raw.join('\n')).not.toContain('Notiz nur für eins');
  expect(c2.frames.some((f) => f.type === 'records-changed' && f.profileId !== 'pb')).toBe(false);
});

test('hevy-connect stores the key sealed and no frame ever carries it', async () => {
  const t = await start();
  const c = await t.as(1);
  t.send(c, { type: 'subscribe', profileId: 'pa' });
  t.send(c, { type: 'hevy-connect', profileId: 'pa', key: HEVY_KEY });
  const file = path.join(t.root, 'accounts', '1', 'hevy', 'pa', 'api-key');
  await vi.waitFor(() => expect(fs.existsSync(file)).toBe(true));
  const stored = fs.readFileSync(file, 'utf8');
  expect(stored.startsWith('pfs1.')).toBe(true);
  expect(stored).not.toContain(HEVY_KEY);
  await settle();
  t.household.scan();
  await settle();
  expect(c.raw.length).toBeGreaterThan(0);
  expect(c.raw.join('\n')).not.toContain(HEVY_KEY);
});

test('profile-update stores profile.json; coach-state.profile carries it with ftpW from the coach state', async () => {
  const t = await start();
  const c = await t.as(1);
  t.send(c, { type: 'subscribe', profileId: 'pa' });
  t.send(c, { type: 'set-ftp', profileId: 'pa', ftpW: 250 });
  t.send(c, { type: 'profile-update', profileId: 'pa', profile: { ...P1, name: 'Anna', ftpW: 999 } });
  await vi.waitFor(() => expect(states(c).at(-1)?.profile?.name).toBe('Anna'));
  expect(JSON.parse(fs.readFileSync(path.join(t.root, 'accounts', '1', 'profile.json'), 'utf8')).name).toBe('Anna');
  expect(states(c).at(-1)!.profile!.ftpW).toBe(250);
  expect(states(c).at(-1)!.state.ftpW).toBe(250);
  // Another profile id is never bound to this account.
  t.send(c, { type: 'profile-update', profileId: 'pa', profile: { ...P2 } });
  await settle();
  expect(JSON.parse(fs.readFileSync(path.join(t.root, 'accounts', '1', 'profile.json'), 'utf8')).id).toBe('pa');
});

test('queued: a change older than the item\'s last change is skipped', async () => {
  const t = await start({ now: { ms: 1000 } });
  t.clock.ms = 1000;
  const c = await t.as(1);
  t.send(c, { type: 'subscribe', profileId: 'pa' });
  t.send(c, { type: 'note', profileId: 'pa', text: 'Mein Knie schmerzt seit gestern' });
  const coach = () => t.household.account(1)!.runtime.coachState('pa')!;
  await vi.waitFor(() => expect(coach().complaints?.length).toBe(1));
  const id = coach().complaints![0]!.id;
  t.clock.ms = 2000;
  t.send(c, { type: 'complaint-update', profileId: 'pa', id, status: 'over' });
  await vi.waitFor(() => expect(coach().complaints![0]!.status).toBe('over'));
  t.clock.ms = 3000;
  t.send(c, { type: 'queued', atMs: 1000, message: { type: 'complaint-update', profileId: 'pa', id, status: 'healing' } });
  await settle();
  expect(coach().complaints![0]!.status).toBe('over');
  // A newer queued change still wins.
  t.send(c, { type: 'queued', atMs: 2500, message: { type: 'complaint-update', profileId: 'pa', id, status: 'healing' } });
  await vi.waitFor(() => expect(coach().complaints![0]!.status).toBe('healing'));
});

test('queued: notes and answers are always applied, in order', async () => {
  const t = await start();
  const c = await t.as(1);
  t.send(c, { type: 'subscribe', profileId: 'pa' });
  t.send(c, { type: 'note', profileId: 'pa', text: 'live' });
  t.send(c, { type: 'queued', atMs: NOON - 3000, message: { type: 'note', profileId: 'pa', text: 'erste' } });
  t.send(c, { type: 'queued', atMs: NOON - 5000, message: { type: 'note', profileId: 'pa', text: 'zweite' } });
  t.send(c, { type: 'queued', atMs: NOON - 4000, message: { type: 'answer-question', profileId: 'pa', questionId: 'q1', text: 'Antwort eins' } });
  t.send(c, { type: 'queued', atMs: NOON - 9000, message: { type: 'answer-question', profileId: 'pa', questionId: 'q2', text: 'Antwort zwei' } });
  const coach = () => t.household.account(1)!.runtime.coachState('pa')!;
  await vi.waitFor(() => expect(coach().motives?.length).toBe(2));
  expect(coach().notes.map((n) => n.text)).toEqual(['live', 'erste', 'zweite']);
  expect(coach().motives!.map((m) => m.text)).toEqual(['Antwort eins', 'Antwort zwei']);
});

test('queued messages outside QUEUEABLE are ignored', async () => {
  const t = await start();
  const c = await t.as(1);
  t.send(c, { type: 'queued', atMs: NOON, message: { type: 'subscribe', profileId: 'pa' } });
  t.send(c, { type: 'queued', atMs: NOON, message: { type: 'hevy-connect', profileId: 'pa', key: HEVY_KEY } });
  t.send(c, { type: 'queued', atMs: NOON, message: { type: 'garmin-health', profileId: 'pa', rangeDays: 7 } });
  t.send(c, { type: 'queued', atMs: NOON, message: { type: 'queued', atMs: NOON, message: { type: 'note', profileId: 'pa', text: 'doppelt verpackt' } } });
  t.send(c, { type: 'queued', atMs: NOON, message: { type: 'records-list', requestId: 'r', profileId: 'pa', kind: 'workout' } });
  t.send(c, { type: 'queued', atMs: 'gestern', message: { type: 'note', profileId: 'pa', text: 'ohne Zeit' } });
  await settle();
  expect(c.frames).toEqual([]);
  expect(t.hevyFetch).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(t.root, 'accounts', '1', 'hevy', 'pa', 'api-key'))).toBe(false);
  const notes = t.household.account(1)!.runtime.coachState('pa')?.notes ?? [];
  expect(notes.map((n) => n.text)).toEqual([]);
});

test('a binary or broken frame is ignored and the socket stays open', async () => {
  const t = await start();
  const c = await t.as(1);
  c.ws.send(Buffer.from([1, 2, 3]));
  c.ws.send('{nope');
  t.send(c, null);
  t.send(c, { type: 'subscribe', profileId: 'pa' });
  await vi.waitFor(() => expect(states(c).length).toBeGreaterThan(0));
  expect(c.ws.readyState).toBe(WebSocket.OPEN);
});

test('/healthz?counts=1 with the token gives each account\'s counts', async () => {
  const t = await start();
  t.household.account(1)!.runtime.handle({ type: 'subscribe', profileId: 'pa' }, () => {});
  const started = vi.spyOn(t.household, 'start');
  const res = await app!.inject({ method: 'GET', url: '/healthz?counts=1', headers: { 'x-pandafit-internal': TOKEN } });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { ok: boolean; accounts: Record<string, { profileId: string; rides: number; records: number; coach: boolean }> };
  expect(body.ok).toBe(true);
  expect(body.accounts['1']).toMatchObject({ profileId: 'pa', rides: 0, records: 0, coach: true });
  expect(body.accounts['2']).toMatchObject({ profileId: 'pb', rides: 0 });
  // A probe reads the disk only: it starts no account's coach.
  expect(started).not.toHaveBeenCalled();
  // One parser decides: a repeated counts=1 is still a counts request and still needs the token.
  expect((await app!.inject({ method: 'GET', url: '/healthz?counts=1&counts=1' })).statusCode).toBe(401);
  const twice = await app!.inject({ method: 'GET', url: '/healthz?counts=1&counts=1', headers: { 'x-pandafit-internal': TOKEN } });
  expect(twice.json()).toHaveProperty('accounts');
});

test('a probe before any socket starts no coach and counts every moved account from the disk', async () => {
  const t = await start({ accounts: [[1, P1], [3, { id: 'pc', name: 'C', ftpW: 150 }, false]] });
  const started = vi.spyOn(t.household, 'start');
  const res = await app!.inject({ method: 'GET', url: '/healthz?counts=1', headers: { 'x-pandafit-internal': TOKEN } });
  expect(Object.keys((res.json() as { accounts: object }).accounts)).toEqual(['1']);
  expect(started).not.toHaveBeenCalled();
});

test('the shared meal plan has one clock: a stale queued tick from account 1 does not undo a newer live tick from account 2', async () => {
  const t = await start({ meals: true });
  const c1 = await t.as(1), c2 = await t.as(2);
  t.send(c1, { type: 'subscribe', profileId: 'pa' });
  t.send(c2, { type: 'subscribe', profileId: 'pb' });
  await vi.waitFor(() => expect(states(c1).at(-1)?.meals).toBeTruthy());
  await vi.waitFor(() => expect(states(c2).at(-1)?.meals).toBeTruthy());
  const week = states(c1).at(-1)!.meals!.currentWeek;
  t.send(c1, { type: 'meals-replan', profileId: 'pa', week });
  const item = () => t.household.account(2)!.runtime.view('pb')!.meals!.weeks.find((w) => w.plan.week === week)?.state.items['Haferflocken']?.state;
  await vi.waitFor(() => expect(t.household.account(1)!.runtime.view('pa')!.meals!.weeks.some((w) => w.plan.week === week)).toBe(true), { timeout: 3000 });
  t.clock.ms = NOON + 2000;
  t.send(c2, { type: 'meals-item', profileId: 'pb', week, item: 'Haferflocken', state: 'gekauft' });
  await vi.waitFor(() => expect(item()).toBe('gekauft'));
  t.clock.ms = NOON + 3000;
  t.send(c1, { type: 'queued', atMs: NOON + 1000, message: { type: 'meals-item', profileId: 'pa', week, item: 'Haferflocken', state: 'offen' } });
  await settle();
  expect(item()).toBe('gekauft');
  // A newer queued tick from account 1 still wins.
  t.send(c1, { type: 'queued', atMs: NOON + 2500, message: { type: 'meals-item', profileId: 'pa', week, item: 'Haferflocken', state: 'da' } });
  await vi.waitFor(() => expect(item()).toBe('da'));
});

test('the clock moves only for a change that was applied', async () => {
  const t = await start();
  const c = await t.as(1);
  t.send(c, { type: 'subscribe', profileId: 'pa' });
  // A refused profile-update (another profile) at 2000 ...
  t.clock.ms = NOON + 2000;
  t.send(c, { type: 'profile-update', profileId: 'pa', profile: { ...P2 } });
  // ... and a meal tick before the household's meals moved change nothing, so they stamp nothing.
  t.send(c, { type: 'meals-item', profileId: 'pa', week: '2026-11-02', item: 'Haferflocken', state: 'da' });
  await settle();
  const clocks = [path.join(t.root, 'accounts', '1', 'clock.json'), path.join(t.root, 'household', 'meals', 'clock.json')];
  for (const f of clocks) if (fs.existsSync(f)) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/profile|meal:/);
  // An older queued profile-update still applies.
  t.send(c, { type: 'queued', atMs: NOON + 1000, message: { type: 'profile-update', profileId: 'pa', profile: { ...P1, name: 'Alt' } } });
  await vi.waitFor(() => expect(t.household.account(1)!.profile().name).toBe('Alt'));
});

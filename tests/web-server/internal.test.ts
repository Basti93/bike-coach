import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAccount } from '../../web-server/auth';
import { openDb } from '../../web-server/db';
import { buildServer } from '../../web-server';
import { buildInternal, startInternal } from '../../web-server/internal';
import { createServer } from 'node:net';
import { b64u, newVapidKeys, type PushType, type Sender } from '../../web-server/push';
import { login, NOW, PW_A, PW_B, post, rec } from './helpers';

const TOKEN = 'a'.repeat(64);
const KEY = newVapidKeys().publicKey;
const AUTH = b64u(Buffer.alloc(16, 3));
const sub = (n: string) => ({ endpoint: `https://web.push.apple.com/sub/${n}`, keys: { p256dh: KEY, auth: AUTH } });
const H = (cookie: string) => ({ cookie, host: 'x.test', origin: 'https://x.test' });
const week = (key: string, over: Record<string, unknown> = {}) => ({ kind: 'mealplan', id: `week-${key}`, updatedMs: NOW, deleted: false, body: { week: key, people: [], meals: [] }, ...over });
const NEXT = '2027-01-18';
const BEARER = { authorization: `Bearer ${TOKEN}` };

const open: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map((a) => a.close())); });

async function servers() {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'pf-int-')), 'test.db');
  const db = openDb(dbPath);
  await createAccount(db, 'anna', PW_A);
  await createAccount(db, 'ben', PW_B);
  db.close();
  const sent: { endpoint: string; type: PushType }[] = [];
  const send: Sender = vi.fn(async (s, type) => { sent.push({ endpoint: s.endpoint, type }); return 'ok' as const; });
  const app = buildServer({ dbPath, nowMs: () => NOW, push: { send } });
  const internal = buildInternal({ dbPath, token: TOKEN, nowMs: () => NOW, push: { send } });
  open.push(app, internal);
  return { app, internal, sent };
}

describe('internal records routes', () => {
  it('the internal routes answer 401 without the token and do not exist on the public app', async () => {
    const { app, internal } = await servers();
    for (const headers of [{}, { authorization: `Bearer ${'b'.repeat(64)}` }, { authorization: TOKEN }, { authorization: `Bearer ${TOKEN}x` }]) {
      expect((await internal.inject({ method: 'GET', url: '/internal/accounts/1/records', headers })).statusCode).toBe(401);
      expect((await internal.inject({ method: 'POST', url: '/internal/accounts/1/records', headers, payload: { records: [rec('w1')] } })).statusCode).toBe(401);
    }
    const a = (await login(app, 'anna', PW_A)).cookie!;
    expect((await app.inject({ method: 'GET', url: '/internal/accounts/1/records', headers: { ...H(a), ...BEARER } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/internal/accounts/1/records', headers: { ...H(a), ...BEARER }, payload: { records: [rec('w1')] } })).statusCode).toBe(404);
    // Nothing was written by any of them.
    expect((await internal.inject({ method: 'GET', url: '/internal/accounts/1/records', headers: BEARER })).json().records).toEqual([]);
  });

  it('an unknown or malformed account id is refused', async () => {
    const { internal } = await servers();
    expect((await internal.inject({ method: 'GET', url: '/internal/accounts/99/records', headers: BEARER })).statusCode).toBe(404);
    expect((await internal.inject({ method: 'POST', url: '/internal/accounts/99/records', headers: BEARER, payload: { records: [rec('w1')] } })).statusCode).toBe(404);
    for (const id of ['0', '-1', '1.5', 'abc', '01'])
      expect((await internal.inject({ method: 'GET', url: `/internal/accounts/${id}/records`, headers: BEARER })).statusCode, id).toBe(404);
  });

  it('internal records behave like the public ones, and a new meal week sends one push', async () => {
    const { app, internal, sent } = await servers();
    const a = (await login(app, 'anna', PW_A)).cookie!, b = (await login(app, 'ben', PW_B)).cookie!;
    expect((await app.inject({ method: 'POST', url: '/push/subscribe', headers: H(a), payload: sub('anna') })).statusCode).toBe(200);

    // The same answer shape, refusals included.
    const bad = { kind: 'nope', id: 'x', updatedMs: NOW, deleted: false, body: {} };
    const pub = (await post(app, H(a), [rec('w1'), bad])).json();
    const int = (await internal.inject({ method: 'POST', url: '/internal/accounts/1/records', headers: BEARER, payload: { records: [rec('w2'), bad] } })).json();
    expect(pub).toEqual({ accepted: 1, refused: [{ kind: 'nope', id: 'x', reason: 'unknown kind' }] });
    expect(int).toEqual(pub);
    expect((await internal.inject({ method: 'POST', url: '/internal/accounts/1/records', headers: BEARER, payload: { records: 'x' } })).statusCode).toBe(400);
    expect((await internal.inject({ method: 'GET', url: '/internal/accounts/1/records?since=-1', headers: BEARER })).statusCode).toBe(400);

    // What the coach writes, the account reads publicly, and the other way round.
    const pubPage = (await app.inject({ method: 'GET', url: '/records', headers: H(a) })).json();
    const intPage = (await internal.inject({ method: 'GET', url: '/internal/accounts/1/records', headers: BEARER })).json();
    expect(intPage).toEqual(pubPage);
    expect(intPage.records.map((r: { id: string }) => r.id)).toEqual(['w1', 'w2']);
    expect(intPage).toMatchObject({ cursor: 2, more: false, reset: false });
    expect(typeof intPage.generation).toBe('string');
    expect((await internal.inject({ method: 'GET', url: '/internal/accounts/1/records?since=1&limit=1', headers: BEARER })).json().records.map((r: { id: string }) => r.id)).toEqual(['w2']);
    // A future cursor starts over, as on the public route.
    expect((await internal.inject({ method: 'GET', url: '/internal/accounts/1/records?since=99', headers: BEARER })).json()).toMatchObject({ reset: true, cursor: 2 });

    // Account 2 sees nothing of account 1.
    expect((await internal.inject({ method: 'GET', url: '/internal/accounts/2/records', headers: BEARER })).json().records).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/records', headers: H(b) })).json().records).toEqual([]);

    // A new meal week written by the coach sends one push, to that account only.
    await internal.inject({ method: 'POST', url: '/internal/accounts/1/records', headers: BEARER, payload: { records: [week(NEXT)] } });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ endpoint: sub('anna').endpoint, type: 'meal' });
    await internal.inject({ method: 'POST', url: '/internal/accounts/1/records', headers: BEARER, payload: { records: [week(NEXT, { updatedMs: NOW + 1 })] } });
    await post(app, H(a), [week(NEXT, { updatedMs: NOW + 2 })]);
    await new Promise((r) => setTimeout(r, 20));
    expect(sent).toHaveLength(1);
  });

  it('a run week written by the coach notifies like a meal week', async () => {
    const { app, internal, sent } = await servers();
    const a = (await login(app, 'anna', PW_A)).cookie!;
    await app.inject({ method: 'POST', url: '/push/subscribe', headers: H(a), payload: sub('anna') });
    const run = (over: Record<string, unknown> = {}) => ({ kind: 'run', id: `week-${NEXT}`, updatedMs: NOW, deleted: false, body: { week: NEXT, announce: true, runs: [{ date: NEXT, kind: 'easy', minutes: 30 }] }, ...over });
    await internal.inject({ method: 'POST', url: '/internal/accounts/1/records', headers: BEARER, payload: { records: [run()] } });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ endpoint: sub('anna').endpoint, type: 'run' });
    await internal.inject({ method: 'POST', url: '/internal/accounts/1/records', headers: BEARER, payload: { records: [run({ updatedMs: NOW + 1 })] } });
    await post(app, H(a), [run({ updatedMs: NOW + 2 })]);
    await new Promise((r) => setTimeout(r, 20));
    expect(sent).toHaveLength(1);
  });

  it('a port that cannot be had is logged, without the token, and the api carries on without the internal app', async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'pf-int-')), 'test.db');
    const busy = createServer();
    await new Promise<void>((r) => busy.listen(0, '127.0.0.1', () => r()));
    const port = (busy.address() as { port: number }).port;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await startInternal({ dbPath, token: TOKEN, host: '127.0.0.1', port })).toBeNull();
      expect(err).toHaveBeenCalledTimes(1);
      expect(String(err.mock.calls[0])).not.toContain(TOKEN);
      // A free port works.
      const ok = await startInternal({ dbPath, token: TOKEN, host: '127.0.0.1', port: 0 });
      expect(ok).not.toBeNull();
      open.push(ok!);
    } finally {
      err.mockRestore();
      busy.close();
    }
  });
});

describe('internal peer check', () => {
  const peerApp = async (lookup: (h: string) => Promise<{ address: string }[]>, clock: { t: number }) => {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'pf-peer-')), 'test.db');
    openDb(dbPath).close();
    const app = buildInternal({ dbPath, token: TOKEN, nowMs: () => clock.t, peer: { host: 'coach', lookup } });
    open.push(app);
    return app;
  };
  const get = (app: Awaited<ReturnType<typeof peerApp>>, remoteAddress: string) =>
    app.inject({ method: 'GET', url: '/internal/accounts/1/records', remoteAddress, headers: BEARER });

  it('accepts only addresses the peer name resolves to, and caches the lookup for 10 seconds', async () => {
    const clock = { t: NOW };
    let addresses = [{ address: '10.9.0.5' }];
    const lookup = vi.fn(async () => addresses);
    const app = await peerApp(lookup, clock);
    expect((await get(app, '10.9.0.5')).statusCode).toBe(404); // past the peer check and the token: no such account
    expect((await get(app, '::ffff:10.9.0.5')).statusCode).toBe(404);
    expect((await get(app, '10.9.0.6')).statusCode).toBe(403);
    expect(lookup).toHaveBeenCalledTimes(1);
    addresses = [{ address: '10.9.0.6' }];
    clock.t += 9_000;
    expect((await get(app, '10.9.0.6')).statusCode).toBe(403);
    clock.t += 2_000;
    expect((await get(app, '10.9.0.6')).statusCode).toBe(404);
    expect((await get(app, '10.9.0.5')).statusCode).toBe(403);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('refuses everything when the lookup fails, and checks the peer before the token', async () => {
    const app = await peerApp(async () => { throw new Error('ENOTFOUND'); }, { t: NOW });
    expect((await get(app, '10.9.0.5')).statusCode).toBe(403);
    const ok = await peerApp(async () => [{ address: '10.9.0.5' }], { t: NOW });
    expect((await ok.inject({ method: 'GET', url: '/internal/accounts/1/records', remoteAddress: '10.9.0.6' })).statusCode).toBe(403);
    expect((await ok.inject({ method: 'GET', url: '/internal/accounts/1/records', remoteAddress: '10.9.0.5' })).statusCode).toBe(401);
  });

  it('without a peer the behaviour is unchanged', async () => {
    const { internal } = await servers();
    expect((await internal.inject({ method: 'GET', url: '/internal/accounts/1/records', remoteAddress: '10.9.0.6', headers: BEARER })).statusCode).toBe(200);
  });
});

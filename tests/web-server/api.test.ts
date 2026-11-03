import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../web-server/db';
import { login, NOW, PW_A, PW_B, post, rec, setup } from './helpers';

const get = (app: any, url: string, cookie: string) => app.inject({ method: 'GET', url, headers: { cookie } });

describe('api', () => {
  it('no route answers without login except login, static files and healthz', async () => {
    const { app } = await setup();
    for (const [method, url] of [['GET', '/me'], ['GET', '/records'], ['POST', '/records'], ['POST', '/logout'], ['GET', '/records?since=0'], ['PUT', '/records'], ['DELETE', '/records']] as const) {
      const r = await app.inject({ method, url, payload: method === 'POST' || method === 'PUT' ? { records: [] } : undefined });
      expect([401, 404], `${method} ${url}`).toContain(r.statusCode);
      if (r.statusCode !== 404) expect(r.statusCode).toBe(401);
    }
    expect((await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer ' + 'a'.repeat(64) } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/me', headers: { cookie: 'pf_session=' + 'a'.repeat(64) } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({ ok: true });
  });

  it('there is no registration route', async () => {
    const { app } = await setup();
    for (const url of ['/register', '/signup', '/accounts', '/account']) {
      expect((await app.inject({ method: 'POST', url, payload: { name: 'eve', password: 'long enough pw' } })).statusCode).toBe(404);
    }
    expect((await login(app, 'eve', 'long enough pw')).res.statusCode).toBe(401);
  });

  it('person A cannot read or overwrite records of person B on any route', async () => {
    const { app } = await setup();
    const a = (await login(app, 'anna', PW_A)).cookie!, b = (await login(app, 'ben', PW_B)).cookie!;
    await post(app, { cookie: a }, [rec('w1', NOW, { who: 'anna' })]);
    // B reads: nothing
    expect((await get(app, '/records', b)).json().records).toEqual([]);
    // B writes the same id with a newer time: A's copy stays untouched
    await post(app, { cookie: b }, [rec('w1', NOW + 5000, { who: 'ben' })]);
    expect((await get(app, '/records', a)).json().records).toEqual([rec('w1', NOW, { who: 'anna' })]);
    expect((await get(app, '/records', b)).json().records[0].body).toEqual({ who: 'ben' });
    // A cannot reach B via a device token of A either
    const t = (await app.inject({ method: 'POST', url: '/device-token', payload: { name: 'anna', password: PW_A, deviceName: 'mac' } })).json().token;
    const viaToken = await app.inject({ method: 'GET', url: '/records', headers: { authorization: `Bearer ${t}` } });
    expect(viaToken.json().records[0].body).toEqual({ who: 'anna' });
    expect((await get(app, '/me', b)).json()).toEqual({ name: 'ben' });
  });

  it('a repeated send creates no duplicate and no new seq', async () => {
    const { app } = await setup();
    const a = (await login(app, 'anna', PW_A)).cookie!;
    const r1 = await post(app, { cookie: a }, [rec('w1'), rec('w2')]);
    expect(r1.json()).toEqual({ accepted: 2, refused: [] });
    const first = (await get(app, '/records', a)).json();
    await post(app, { cookie: a }, [rec('w1'), rec('w2')]);
    const second = (await get(app, '/records', a)).json();
    expect(second.records).toHaveLength(2);
    expect(second.cursor).toBe(first.cursor);
    expect((await get(app, `/records?since=${first.cursor}`, a)).json()).toMatchObject({ records: [], cursor: first.cursor, more: false, reset: false });
  });

  it('an older send does not win and the overwritten copy is kept', async () => {
    const { app, dbPath } = await setup();
    const a = (await login(app, 'anna', PW_A)).cookie!;
    await post(app, { cookie: a }, [rec('w1', NOW, { v: 'new' })]);
    await post(app, { cookie: a }, [rec('w1', NOW - 1000, { v: 'old' })]);
    expect((await get(app, '/records', a)).json().records[0].body).toEqual({ v: 'new' });
    await post(app, { cookie: a }, [rec('w1', NOW + 1000, { v: 'newer' })]);
    const db = openDb(dbPath);
    const lost = (db.prepare('SELECT body FROM overwritten ORDER BY n').all() as { body: string }[]).map((r) => JSON.parse(r.body));
    expect(lost).toEqual([{ v: 'old' }, { v: 'new' }]);
  });

  it('overwritten is capped at 500 per account', async () => {
    const { app, dbPath } = await setup();
    const a = (await login(app, 'anna', PW_A)).cookie!;
    for (let k = 0; k < 3; k++) {
      await post(app, { cookie: a }, Array.from({ length: 200 }, (_, i) => rec(`w${i}`, NOW + k * 1000, { k })));
    }
    const db = openDb(dbPath);
    expect((db.prepare('SELECT COUNT(*) AS c FROM overwritten').get() as { c: number }).c).toBe(400);
    await post(app, { cookie: a }, Array.from({ length: 200 }, (_, i) => rec(`w${i}`, NOW + 5000, { k: 9 })));
    expect((db.prepare('SELECT COUNT(*) AS c FROM overwritten').get() as { c: number }).c).toBe(500);
  });

  it('a body over 5 MB or a malformed record is refused, with reasons', async () => {
    const { app } = await setup();
    const a = (await login(app, 'anna', PW_A)).cookie!;
    const big = await post(app, { cookie: a }, [rec('big', NOW, 'x'.repeat(5 * 1024 * 1024))]);
    expect(big.statusCode).toBe(413);
    const res = await post(app, { cookie: a }, [
      rec('ok'), rec('big', NOW, 'x'.repeat(1024 * 1024 + 1)), rec('', NOW), rec('i'.repeat(201)), rec('k', NOW, 1, { kind: 'nope' }),
      rec('future', NOW + 8 * 24 * 3600 * 1000), rec('nan', NOW, 1, { updatedMs: 'x' }), rec('nodel', NOW, 1, { deleted: 'no' }), 'junk',
      rec('extra', NOW, { a: 1, extra: [1, 2] }, { more: 1 }),
    ]);
    const j = res.json();
    expect(j.accepted).toBe(2);
    expect(j.refused.map((r: any) => r.reason)).toEqual(['body too large', 'bad id', 'bad id', 'unknown kind', 'updatedMs too far ahead', 'bad updatedMs', 'bad deleted', 'not an object']);
    expect(j.refused[0]).toMatchObject({ kind: 'workout', id: 'big' });
    expect((await get(app, '/records', a)).json().records.find((r: any) => r.id === 'extra').body).toEqual({ a: 1, extra: [1, 2] });
    expect((await post(app, { cookie: a }, 'nope' as any)).statusCode).toBe(400);
    expect((await get(app, '/records?since=abc', a)).statusCode).toBe(400);
  });

  it('GET /records pages with at most 500 per page', async () => {
    const { app } = await setup();
    const a = (await login(app, 'anna', PW_A)).cookie!;
    for (let k = 0; k < 3; k++) await post(app, { cookie: a }, Array.from({ length: 400 }, (_, i) => rec(`w${k}-${i}`)));
    const p1 = (await get(app, '/records?limit=9999', a)).json();
    expect(p1.records).toHaveLength(500); expect(p1.more).toBe(true);
    const p2 = (await get(app, `/records?since=${p1.cursor}&limit=500`, a)).json();
    expect(p2.records).toHaveLength(500);
    const p3 = (await get(app, `/records?since=${p2.cursor}`, a)).json();
    expect(p3.records).toHaveLength(200); expect(p3.more).toBe(false);
    expect((await get(app, '/records?limit=2', a)).json().records).toHaveLength(2);
  });

  it('cookie requests that change data need a same-origin check; tokens do not', async () => {
    const { app } = await setup();
    const a = (await login(app, 'anna', PW_A)).cookie!;
    const send = (headers: Record<string, string>) => app.inject({ method: 'POST', url: '/records', headers: { host: 'x.test', cookie: a, ...headers }, payload: { records: [] } });
    expect((await send({})).statusCode).toBe(403);
    expect((await send({ origin: 'http://evil.test' })).statusCode).toBe(403);
    expect((await send({ origin: 'http://x.test' })).statusCode).toBe(200);
    expect((await send({ 'sec-fetch-site': 'same-origin' })).statusCode).toBe(200);
    expect((await send({ 'sec-fetch-site': 'cross-site' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/logout', headers: { cookie: a, origin: 'http://evil.test', host: 'x.test' } })).statusCode).toBe(403);
    const t = (await app.inject({ method: 'POST', url: '/device-token', payload: { name: 'anna', password: PW_A, deviceName: 'm' } })).json().token;
    expect((await app.inject({ method: 'POST', url: '/records', headers: { authorization: `Bearer ${t}` }, payload: { records: [] } })).statusCode).toBe(200);
  });

  it('logout ends the session', async () => {
    const { app } = await setup();
    const a = (await login(app, 'anna', PW_A)).cookie!;
    expect((await app.inject({ method: 'POST', url: '/logout', headers: { cookie: a, host: 'x.test', origin: 'http://x.test' } })).statusCode).toBe(200);
    expect((await get(app, '/me', a)).statusCode).toBe(401);
  });

  it('security headers on all answers; static files only from staticDir', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pf-static-'));
    mkdirSync(join(root, 'public'));
    writeFileSync(join(root, 'public', 'index.html'), '<h1>hi</h1>');
    writeFileSync(join(root, 'secret.txt'), 'secret');
    const { app } = await setup({ staticDir: join(root, 'public') });
    const h = await app.inject({ method: 'GET', url: '/healthz' });
    expect(h.headers['x-content-type-options']).toBe('nosniff');
    expect(h.headers['referrer-policy']).toBe('no-referrer');
    expect(h.headers['cache-control']).toBe('no-store');
    expect(h.headers['x-frame-options']).toBe('DENY');
    const s = await app.inject({ method: 'GET', url: '/' });
    expect(s.statusCode).toBe(200); expect(s.body).toBe('<h1>hi</h1>');
    expect(s.headers['content-security-policy']).toContain("default-src 'self'");
    expect(s.headers['x-content-type-options']).toBe('nosniff');
    for (const url of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/%2e%2e%2fsecret.txt', '/nope', '/%00']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
    expect((await app.inject({ method: 'POST', url: '/nope', payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/login', payload: 'x', headers: { 'content-type': 'application/json' } })).json()).toEqual({ error: 'bad request' });
  });
});

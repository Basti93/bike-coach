import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { run } from '../../web-server/cli';
import { login, NOW, PW_A, PW_B, post, rec, setup } from './helpers';

let app: FastifyInstance | null = null;
afterEach(async () => { await app?.close(); app = null; });

const rows = (dbPath: string, id = 'w') => {
  const d = new DatabaseSync(dbPath);
  const out = d.prepare('SELECT updated_ms AS u, deleted FROM overwritten WHERE id = ? ORDER BY updated_ms').all(id) as { u: number; deleted: number }[];
  d.close();
  return out;
};

async function start() {
  const s = await setup();
  app = s.app;
  const { cookie } = await login(app, 'anna', PW_A);
  const send = (r: unknown) => post(app!, { cookie: cookie! }, [r]);
  return { ...s, send };
}

describe('kept rows on the server', () => {
  it('forward edits keep at most 3 rows per record, the oldest removed first', async () => {
    const { dbPath, send } = await start();
    for (let u = 1; u <= 8; u++) await send(rec('w', u, { n: u }));
    expect(rows(dbPath).map((r) => r.u)).toEqual([5, 6, 7]);
    await send(rec('other', 1, { n: 1 })); await send(rec('other', 2, { n: 2 }));
    expect(rows(dbPath, 'other').map((r) => r.u)).toEqual([1]);
  });

  it('the loser of a stale send always stays, also behind 3 newer rows and later edits', async () => {
    const { dbPath, send } = await start();
    for (let u = 10; u <= 15; u++) await send(rec('w', u, { n: u }));
    await send(rec('w', 2, { sets: 20 }));
    for (let u = 16; u <= 20; u++) await send(rec('w', u, { n: u }));
    expect(rows(dbPath).map((r) => r.u)).toEqual([2, 17, 18, 19]);
  });

  it('a stale repeat adds no second row', async () => {
    const { dbPath, send } = await start();
    await send(rec('w', 10));
    for (let i = 0; i < 3; i++) await send(rec('w', 2, { sets: 20 }));
    expect(rows(dbPath)).toHaveLength(1);
  });

  it('keeps the deleted flag of a tombstone that lost or was replaced', async () => {
    const { dbPath, send } = await start();
    await send(rec('w', 10, {}, { deleted: true }));
    await send(rec('w', 20));
    await send(rec('w', 5, {}, { deleted: true }));
    expect(rows(dbPath)).toEqual([{ u: 5, deleted: 1 }, { u: 10, deleted: 1 }]);
  });
});

describe('list-kept', () => {
  it('lists an account\'s kept copies with their content and changes nothing', async () => {
    const { dbPath, send } = await start();
    await send(rec('w', 10, { n: 'neu' }));
    await send(rec('w', 2, { n: 'alt' }, { deleted: true }));
    const { cookie: other } = await login(app!, 'ben', PW_B);
    await post(app!, { cookie: other! }, [rec('b', NOW, { n: 1 })]);
    await post(app!, { cookie: other! }, [rec('b', 1, { n: 'nur ben' })]);
    const out: string[] = [];
    const before = rows(dbPath);
    expect(await run(['list-kept', '--name', 'anna'], dbPath, { readPassword: async () => '', out: (s) => out.push(s) })).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]!.split('\t').slice(0, 5)).toEqual(['workout', 'w', '2', 'gelöscht', 'veraltet gesendet']);
    expect(out[0]).toContain('{"n":"alt"}');
    expect(out.join()).not.toContain('nur ben');
    expect(rows(dbPath)).toEqual(before);
    expect(await run(['list-kept', '--name', 'niemand'], dbPath, { readPassword: async () => '', out: () => {} })).toBe(1);
  });
});

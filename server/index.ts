import Fastify, { type FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';
import { openDb } from './db';

type Row = { json: string };
type Params = { rideId: string };

export const buildServer = (opts: { dbPath: string; token: string }): FastifyInstance => {
  const db = openDb(opts.dbPath);
  const app = Fastify({ bodyLimit: 20 * 1024 * 1024 });
  const insertAll = (sql: string, rows: unknown[][]) => {
    const stmt = db.prepare(sql);
    db.exec('BEGIN');
    try {
      for (const r of rows) stmt.run(...(r as (string | number)[]));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const jsonRows = (rows: unknown[]) => (rows as Row[]).map((r) => JSON.parse(r.json) as unknown);

  app.get('/health', async () => ({ ok: true }));
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    if (req.headers.authorization !== `Bearer ${opts.token}`) return reply.code(401).send({ error: 'unauthorized' });
  });
  app.put<{ Params: Params; Body: { profileId: string } }>('/rides/:rideId/meta', async (req) => {
    db.prepare('INSERT INTO rides VALUES (?, ?, ?) ON CONFLICT(ride_id) DO UPDATE SET json = excluded.json')
      .run(req.params.rideId, req.body.profileId, JSON.stringify(req.body));
    return { ok: true };
  });
  app.post<{ Params: Params; Body: { seq: number }[] }>('/rides/:rideId/samples', async (req) => {
    insertAll('INSERT OR IGNORE INTO samples VALUES (?, ?, ?)', req.body.map((s) => [req.params.rideId, s.seq, JSON.stringify(s)]));
    return { ok: true };
  });
  app.post<{ Params: Params; Body: { startIndex: number; events: unknown[] } }>('/rides/:rideId/events', async (req) => {
    insertAll('INSERT OR IGNORE INTO events VALUES (?, ?, ?)', req.body.events.map((e, i) => [req.params.rideId, req.body.startIndex + i, JSON.stringify(e)]));
    return { ok: true };
  });
  app.get<{ Params: Params }>('/rides/:rideId/progress', async (req) => {
    const s = db.prepare('SELECT MAX(seq) AS m FROM samples WHERE ride_id = ?').get(req.params.rideId) as { m: number | null };
    const e = db.prepare('SELECT COUNT(*) AS c FROM events WHERE ride_id = ?').get(req.params.rideId) as { c: number };
    return { lastSeq: s.m ?? -1, eventCount: e.c };
  });
  app.get<{ Params: Params }>('/rides/:rideId/samples', async (req) =>
    jsonRows(db.prepare('SELECT json FROM samples WHERE ride_id = ? ORDER BY seq').all(req.params.rideId)));
  app.get<{ Params: { id: string } }>('/profiles/:id/rides', async (req) =>
    jsonRows(db.prepare('SELECT json FROM rides WHERE profile_id = ?').all(req.params.id)));
  app.put<{ Params: { id: string }; Body: unknown }>('/profiles/:id/coach', async (req) => {
    db.prepare('INSERT INTO coach VALUES (?, ?) ON CONFLICT(profile_id) DO UPDATE SET json = excluded.json').run(req.params.id, JSON.stringify(req.body));
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>('/profiles/:id/coach', async (req) => {
    const row = db.prepare('SELECT json FROM coach WHERE profile_id = ?').get(req.params.id) as Row | undefined;
    return row ? JSON.parse(row.json) : {};
  });
  return app;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.SYNC_TOKEN;
  if (!token) throw new Error('SYNC_TOKEN fehlt');
  await buildServer({ dbPath: process.env.DB_PATH ?? '/data/bike-coach.db', token }).listen({ port: 7002, host: '0.0.0.0' });
}

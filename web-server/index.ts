import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { existsSync, realpathSync, statSync, readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyRecord, type RecordKind, type TrackedRecord } from '../src/shared/records';
import { clientIp, dropAttempt, hashToken, isLimited, MAX_PASSWORD, newToken, recordAttempt, safeEqual, verifyPassword } from './auth';
import { generationOf, openDb } from './db';
import { announceVersion, buildVersion, createPush, MAX_SUBSCRIPTIONS, mealWeekOf, rememberOrigin, storedOrigin, validEndpoint, validKeys, vapidKeys, webPushSender, type Sender } from './push';

const KINDS: readonly RecordKind[] = ['workout', 'routine', 'exercise', 'mobility', 'complaint', 'plan', 'mealplan', 'together'];
const BODY_LIMIT = 5 * 1024 * 1024;
const RECORD_BODY_LIMIT = 1024 * 1024;
const MAX_RECORDS_PER_POST = 1000;
const MAX_PAGE = 500;
const LOGIN_BODY_LIMIT = 8192;
const PUSH_BODY_LIMIT = 4096;
const MAX_AHEAD_MS = 7 * 24 * 3600 * 1000;
const SESSION_MS = 90 * 24 * 3600 * 1000;
const KEEP_OVERWRITTEN = 500;
const KEEP_PER_RECORD = 3;
const COOKIE = 'pf_session';
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

type Row = { kind: string; id: string; updated_ms: number; deleted: number; body: string; seq: number };
const toRecord = (r: Row): TrackedRecord => ({ kind: r.kind as RecordKind, id: r.id, updatedMs: r.updated_ms, deleted: r.deleted === 1, body: JSON.parse(r.body) as unknown });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

export type PushOptions = {
  /** 'web': the real push services. Null or missing: nothing is ever sent (tests, the restore drill). */
  send?: Sender | 'web' | null;
  /** VAPID subject (mailto: or https:); defaults to the public origin the app is used from. */
  subject?: string;
  /** The build version of the web app; announced once when it differs from the last one. */
  version?: string | null;
};

export const buildServer = (opts: { dbPath: string; staticDir?: string; nowMs?: () => number; trustProxyCidr?: string; push?: PushOptions }): FastifyInstance => {
  const db = openDb(opts.dbPath);
  const now = opts.nowMs ?? Date.now;
  const app = Fastify({ logger: false, bodyLimit: BODY_LIMIT, requestTimeout: 30000 });
  const staticRoot = opts.staticDir && existsSync(opts.staticDir) ? realpathSync(opts.staticDir) : null;
  const accounts = new WeakMap<FastifyRequest, number>();
  /** How the request logged in: a push subscription is bound to it and ends with it. */
  const owners = new WeakMap<FastifyRequest, { session: string } | { device: number }>();
  const pushKeys = vapidKeys(db);
  const send = opts.push?.send === 'web' ? webPushSender({ keys: pushKeys, subject: () => opts.push?.subject ?? storedOrigin(db), now }) : opts.push?.send ?? null;
  const push = createPush(db, send, now);

  app.setErrorHandler((err: { statusCode?: number; name?: string }, req, reply) => {
    const code = typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (code === 500) console.error('server error', req.method, req.url.split('?')[0], err.name ?? 'Error');
    return reply.code(code).send({ error: code === 413 ? 'too large' : code === 500 ? 'error' : 'bad request' });
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY');
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
  });

  const cookieOf = (req: FastifyRequest): string | null => {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{64})(?:;|$)`).exec(req.headers.cookie ?? '');
    return m ? m[1]! : null;
  };
  const setCookie = (reply: FastifyReply, token: string, maxAge = SESSION_MS / 1000) =>
    reply.header('Set-Cookie', `${COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`);
  const sameOrigin = (req: FastifyRequest): boolean => {
    const origin = req.headers.origin;
    if (typeof origin === 'string') {
      try { return new URL(origin).host === req.headers.host; } catch { return false; }
    }
    return req.headers['sec-fetch-site'] === 'same-origin';
  };
  const ipOf = (req: FastifyRequest) => clientIp(req.socket.remoteAddress ?? '', req.headers['x-forwarded-for'] as string | undefined, opts.trustProxyCidr);

  /** Resolves a device token or session cookie to an account id. Any failure answers the same 401. */
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = req.headers.authorization;
    if (typeof auth === 'string') {
      const m = /^Bearer ([0-9a-f]{64})$/.exec(auth);
      const h = m ? hashToken(m[1]!) : null;
      const row = h ? (db.prepare('SELECT id, account_id, token_hash FROM devices WHERE token_hash = ? AND revoked = 0').get(h) as { id: number; account_id: number; token_hash: string } | undefined) : undefined;
      if (row && h && safeEqual(Buffer.from(row.token_hash), Buffer.from(h))) { accounts.set(req, row.account_id); owners.set(req, { device: row.id }); return; }
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const token = cookieOf(req);
    if (token) {
      const h = hashToken(token), t = now();
      const row = db.prepare('SELECT account_id, token_hash, expires_ms FROM sessions WHERE token_hash = ?').get(h) as { account_id: number; token_hash: string; expires_ms: number } | undefined;
      if (row && safeEqual(Buffer.from(row.token_hash), Buffer.from(h)) && row.expires_ms > t) {
        if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) return reply.code(403).send({ error: 'forbidden' });
        db.prepare('UPDATE sessions SET expires_ms = ? WHERE token_hash = ?').run(t + SESSION_MS, h);
        if (req.routeOptions.url !== '/logout') setCookie(reply, token);
        accounts.set(req, row.account_id);
        owners.set(req, { session: h });
        return;
      }
    }
    return reply.code(401).send({ error: 'unauthorized' });
  };
  const acct = (req: FastifyRequest) => accounts.get(req)!;

  /** Shared by /login and /device-token: limit, password check, identical failure answer. */
  const checkCredentials = async (req: FastifyRequest, reply: FastifyReply, body: unknown): Promise<number | null> => {
    const b = isObj(body) ? body : {};
    if (!str(b.name, 100) || typeof b.password !== 'string' || b.password.length === 0 || b.password.length > MAX_PASSWORD) { reply.code(400).send({ error: 'bad request' }); return null; }
    const t = now(), ip = ipOf(req), key = b.name.toLowerCase();
    if (isLimited(db, t, ip, key)) { reply.code(429).send({ error: 'too many attempts' }); return null; }
    const attempt = recordAttempt(db, t, ip, key);
    const id = await verifyPassword(db, b.name, b.password);
    if (id === 'busy') { dropAttempt(db, attempt); reply.code(429).send({ error: 'too many attempts' }); return null; }
    if (id === null) { reply.code(401).send({ error: 'login failed' }); return null; }
    dropAttempt(db, attempt);
    return id;
  };

  app.get('/healthz', async () => ({ ok: true }));

  app.post('/login', { bodyLimit: LOGIN_BODY_LIMIT }, async (req, reply) => {
    const id = await checkCredentials(req, reply, req.body);
    if (id === null) return reply;
    const t = now(), token = newToken();
    db.prepare('DELETE FROM sessions WHERE expires_ms <= ?').run(t);
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hashToken(token), id, t + SESSION_MS);
    setCookie(reply, token);
    return { ok: true };
  });

  app.post('/logout', { onRequest: requireAuth }, async (req, reply) => {
    const token = cookieOf(req);
    if (token) {
      db.prepare('DELETE FROM push_subs WHERE session_hash = ?').run(hashToken(token));
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    }
    setCookie(reply, '', 0);
    return { ok: true };
  });

  app.post('/device-token', { bodyLimit: LOGIN_BODY_LIMIT }, async (req, reply) => {
    const id = await checkCredentials(req, reply, req.body);
    if (id === null) return reply;
    const dn = (req.body as { deviceName?: unknown }).deviceName;
    if (!str(dn, 100)) return reply.code(400).send({ error: 'bad request' });
    const token = newToken();
    const r = db.prepare('INSERT INTO devices (account_id, name, token_hash) VALUES (?, ?, ?)').run(id, dn, hashToken(token));
    return { token, deviceId: Number(r.lastInsertRowid) };
  });

  app.get('/me', { onRequest: requireAuth }, async (req) => {
    const r = db.prepare('SELECT name FROM accounts WHERE id = ?').get(acct(req)) as { name: string };
    return { name: r.name };
  });

  // --- push notifications: the public key, and one subscription per browser, bound to the login it came with ---
  app.get('/push/key', { onRequest: requireAuth }, async () => ({ key: pushKeys.publicKey }));

  app.post('/push/subscribe', { onRequest: requireAuth, bodyLimit: PUSH_BODY_LIMIT }, async (req, reply) => {
    const b = isObj(req.body) ? req.body : {};
    if (!validEndpoint(b.endpoint) || !validKeys(b.keys)) return reply.code(400).send({ error: 'bad request' });
    const account = acct(req), owner = owners.get(req)!;
    // The subject of the VAPID token defaults to the public origin the app is used from.
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : `https://${req.headers.host ?? ''}`;
    if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)) rememberOrigin(db, origin.toLowerCase());
    db.prepare(`INSERT INTO push_subs (endpoint, account_id, p256dh, auth, session_hash, device_id, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET account_id = excluded.account_id, p256dh = excluded.p256dh, auth = excluded.auth,
        session_hash = excluded.session_hash, device_id = excluded.device_id, created_ms = excluded.created_ms`)
      .run(b.endpoint, account, b.keys.p256dh, b.keys.auth, 'session' in owner ? owner.session : null, 'device' in owner ? owner.device : null, now());
    db.prepare('DELETE FROM push_subs WHERE account_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subs WHERE account_id = ? ORDER BY created_ms DESC, rowid DESC LIMIT ?)')
      .run(account, account, MAX_SUBSCRIPTIONS);
    return { ok: true };
  });

  app.post('/push/unsubscribe', { onRequest: requireAuth, bodyLimit: PUSH_BODY_LIMIT }, async (req, reply) => {
    const b = isObj(req.body) ? req.body : {};
    if (!str(b.endpoint, 1024)) return reply.code(400).send({ error: 'bad request' });
    db.prepare('DELETE FROM push_subs WHERE endpoint = ? AND account_id = ?').run(b.endpoint, acct(req));
    return { ok: true };
  });

  app.post('/records', { onRequest: requireAuth }, async (req, reply) => {
    const list = isObj(req.body) ? req.body.records : undefined;
    if (!Array.isArray(list) || list.length > MAX_RECORDS_PER_POST) return reply.code(400).send({ error: 'bad request' });
    const account = acct(req), t = now();
    const refused: { kind: unknown; id: unknown; reason: string }[] = [];
    let accepted = 0, newMealWeek = false;
    const weekStmt = db.prepare('INSERT OR IGNORE INTO push_meal_weeks VALUES (?, ?)');
    const getStmt = db.prepare('SELECT * FROM records WHERE account_id = ? AND kind = ? AND id = ?');
    const putStmt = db.prepare(`INSERT INTO records (account_id, kind, id, updated_ms, deleted, body, seq)
      VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records WHERE account_id = ?))
      ON CONFLICT (account_id, kind, id) DO UPDATE SET updated_ms = excluded.updated_ms, deleted = excluded.deleted, body = excluded.body, seq = excluded.seq`);
    const lostStmt = db.prepare('INSERT INTO overwritten (account_id, kind, id, updated_ms, body, at_ms, deleted, stale) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const haveLostStmt = db.prepare('SELECT 1 FROM overwritten WHERE account_id = ? AND kind = ? AND id = ? AND updated_ms = ? AND deleted = ? AND body = ?');
    // Forward edits leave a short trail per record. The loser of a stale send was never based on what stayed: it is not part of that trail.
    const trimStmt = db.prepare(`DELETE FROM overwritten WHERE account_id = ? AND kind = ? AND id = ? AND stale = 0 AND n NOT IN
      (SELECT n FROM overwritten WHERE account_id = ? AND kind = ? AND id = ? AND stale = 0 ORDER BY updated_ms DESC, n DESC LIMIT ?)`);
    db.exec('BEGIN');
    try {
      for (const raw of list as unknown[]) {
        const r = isObj(raw) ? raw : {};
        const ref = { kind: r.kind, id: r.id };
        const reason =
          !isObj(raw) ? 'not an object'
          : !KINDS.includes(r.kind as RecordKind) ? 'unknown kind'
          : !str(r.id, 200) ? 'bad id'
          : typeof r.updatedMs !== 'number' || !Number.isFinite(r.updatedMs) ? 'bad updatedMs'
          : r.updatedMs > t + MAX_AHEAD_MS ? 'updatedMs too far ahead'
          : typeof r.deleted !== 'boolean' ? 'bad deleted'
          : r.body === undefined ? 'missing body'
          : Buffer.byteLength(JSON.stringify(r.body)) > RECORD_BODY_LIMIT ? 'body too large'
          : null;
        if (reason) { refused.push({ ...ref, reason }); continue; }
        const incoming: TrackedRecord = { kind: r.kind as RecordKind, id: r.id as string, updatedMs: r.updatedMs as number, deleted: r.deleted as boolean, body: r.body };
        const cur = getStmt.get(account, incoming.kind, incoming.id) as Row | undefined;
        const { keep, overwritten } = applyRecord(cur ? toRecord(cur) : undefined, incoming);
        if (overwritten) {
          const body = JSON.stringify(overwritten.body), del = overwritten.deleted ? 1 : 0;
          if (!haveLostStmt.get(account, overwritten.kind, overwritten.id, overwritten.updatedMs, del, body)) lostStmt.run(account, overwritten.kind, overwritten.id, overwritten.updatedMs, body, t, del, overwritten === incoming ? 1 : 0);
          if (keep === incoming) trimStmt.run(account, keep.kind, keep.id, account, keep.kind, keep.id, KEEP_PER_RECORD);
        }
        if (keep === incoming) {
          putStmt.run(account, keep.kind, keep.id, keep.updatedMs, keep.deleted ? 1 : 0, JSON.stringify(keep.body), account);
          const w = mealWeekOf(keep, t);
          if (w && weekStmt.run(account, w).changes > 0) newMealWeek = true;
        }
        accepted++;
      }
      db.prepare('DELETE FROM overwritten WHERE account_id = ? AND n NOT IN (SELECT n FROM overwritten WHERE account_id = ? ORDER BY stale DESC, n DESC LIMIT ?)').run(account, account, KEEP_OVERWRITTEN);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    if (newMealWeek) void push.notifyAccount(account, 'meal'); // fire and forget, after the data is safe
    return { accepted, refused };
  });

  app.get<{ Querystring: { since?: string; limit?: string } }>('/records', { onRequest: requireAuth }, async (req, reply) => {
    let since = req.query.since === undefined ? 0 : Number(req.query.since);
    const limit = req.query.limit === undefined ? MAX_PAGE : Number(req.query.limit);
    if (!Number.isInteger(since) || since < 0 || !Number.isInteger(limit) || limit < 1) return reply.code(400).send({ error: 'bad request' });
    const n = Math.min(limit, MAX_PAGE);
    // A cursor from the future means the server lost data (restore): start over so nothing is missed.
    const top = (db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM records WHERE account_id = ?').get(acct(req)) as { m: number }).m;
    const reset = since > top;
    if (reset) since = 0;
    const rows = db.prepare('SELECT * FROM records WHERE account_id = ? AND seq > ? ORDER BY seq LIMIT ?').all(acct(req), since, n + 1) as Row[];
    const page = rows.slice(0, n);
    return { records: page.map(toRecord), cursor: page.length ? page[page.length - 1]!.seq : since, more: rows.length > n, reset, generation: generationOf(db) };
  });

  // Static files: GET only, only from staticDir, no traversal, no symlink escape.
  app.setNotFoundHandler(async (req, reply) => {
    if (!staticRoot || (req.method !== 'GET' && req.method !== 'HEAD')) return reply.code(404).send({ error: 'not found' });
    try {
      let rel = decodeURIComponent(req.url.split('?')[0]!);
      if (rel.includes('\0') || rel.includes('\\')) throw new Error('bad path');
      if (rel.split('/').some((seg) => seg.startsWith('.') && seg !== '.well-known')) throw new Error('hidden');
      let file = resolve(staticRoot, '.' + rel);
      if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, 'index.html');
      file = realpathSync(file);
      if (file !== staticRoot && !file.startsWith(staticRoot + sep)) throw new Error('outside');
      if (!statSync(file).isFile()) throw new Error('not a file');
      return reply.header('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream')
        .header('Content-Security-Policy', CSP).header('Cache-Control', 'no-cache').send(readFileSync(file));
    } catch {
      return reply.code(404).send({ error: 'not found' });
    }
  });

  const version = opts.push?.version;
  if (version) app.addHook('onReady', async () => { void announceVersion(db, push, version); });
  app.addHook('onClose', async () => { db.close(); });
  return app;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!process.env.PANDAFIT_TRUST_PROXY_CIDR) console.warn('warning: PANDAFIT_TRUST_PROXY_CIDR is not set; all clients are seen at the proxy address and share one login limit');
  const staticDir = process.env.PANDAFIT_STATIC;
  let subject = process.env.PANDAFIT_PUSH_SUBJECT?.trim() || undefined;
  if (subject && !/^(mailto:|https:\/\/)\S+$/.test(subject)) { console.warn('warning: PANDAFIT_PUSH_SUBJECT must start with mailto: or https://; using the public origin'); subject = undefined; }
  let version: string | null = null;
  try { if (staticDir && existsSync(staticDir)) version = buildVersion(staticDir); } catch { /* no announcement without a build */ }
  const app = buildServer({
    dbPath: process.env.PANDAFIT_DB ?? 'pandafit.db',
    staticDir,
    trustProxyCidr: process.env.PANDAFIT_TRUST_PROXY_CIDR,
    // PANDAFIT_PUSH=off sends nothing (the restore drill runs on a copy that holds real subscriptions).
    push: process.env.PANDAFIT_PUSH === 'off' ? undefined : { send: 'web', subject, version },
  });
  app.listen({ port: Number(process.env.PORT ?? 8080), host: process.env.HOST ?? '127.0.0.1' });
}

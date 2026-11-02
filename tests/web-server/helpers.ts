import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createAccount } from '../../web-server/auth';
import { openDb } from '../../web-server/db';
import { buildServer } from '../../web-server';

export const PW_A = 'correct horse a1', PW_B = 'correct horse b2';
export const NOW = 1_800_000_000_000;

export const setup = async (extra: { staticDir?: string; trustProxyCidr?: string } = {}) => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'pf-')), 'test.db');
  const db = openDb(dbPath);
  await createAccount(db, 'anna', PW_A);
  await createAccount(db, 'ben', PW_B);
  db.close();
  const clock = { now: NOW };
  const app: FastifyInstance = buildServer({ dbPath, nowMs: () => clock.now, ...extra });
  return { app, dbPath, clock };
};

export const login = async (app: FastifyInstance, name: string, password: string, remoteAddress?: string) => {
  const res = await app.inject({ method: 'POST', url: '/login', payload: { name, password }, remoteAddress });
  const cookie = /pf_session=[0-9a-f]+/.exec(String(res.headers['set-cookie']))?.[0];
  return { res, cookie };
};
export const rec = (id: string, updatedMs = NOW, body: unknown = { n: 1 }, over: Record<string, unknown> = {}) =>
  ({ kind: 'workout', id, updatedMs, deleted: false, body, ...over });
export const post = (app: FastifyInstance, headers: Record<string, string>, records: unknown[]) =>
  app.inject({ method: 'POST', url: '/records', headers: { host: 'x.test', origin: 'http://x.test', ...headers }, payload: { records } });

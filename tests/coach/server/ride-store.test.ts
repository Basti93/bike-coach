import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readRideUpload, rideHash, type RideFiles, type RideUpload } from '../../../src/coach/ride-upload-format';
import { Household } from '../../../src/coach/server/household';
import { buildCoachServer } from '../../../src/coach/server/http';
import { storeRide } from '../../../src/coach/server/ride-store';
import type { Sample } from '../../../src/shared/sample';

const TOKEN = 'b'.repeat(64);
const NOON = new Date(2026, 10, 3, 12, 0).getTime();
const RID = 'ride-1000-0a1b2c3d';
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
const session = { id: 'ki', name: 'KI', steps: [{ kind: 'erg', durationS: 1500, ftpFraction: 0.65, label: 'Locker' }] };

const filesOf = (o: { profileId?: string; status?: string; rideId?: string; seconds?: number; power?: number } = {}): RideFiles => {
  const startedAtMs = NOON - 3600_000;
  const samples = Array.from({ length: o.seconds ?? 1500 }, (_, i): Sample => ({ seq: i, wallClockMs: startedAtMs + i * 1000, rideElapsedS: i + 1, powerW: o.power ?? 130, cadenceRpm: 90, speedKph: 30, hrBpm: 130, targetW: 130, gradePct: null, gear: null }));
  return {
    'meta.json': JSON.stringify({ rideId: o.rideId ?? RID, profileId: o.profileId ?? 'pa', sessionId: 'ki', startedAtMs, status: o.status ?? 'finished' }),
    'session.json': JSON.stringify({ session, ftpW: 200 }),
    'samples.jsonl': samples.map((s) => JSON.stringify(s)).join('\n') + '\n',
    'events.jsonl': '',
  };
};
const uploadOf = (files: RideFiles, over: Partial<RideUpload> = {}): RideUpload => ({ v: 1, rideId: RID, files, fit: null, sha256: rideHash(files), ...over });

let app: FastifyInstance | null = null;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ records: [], cursor: 0, more: false, refused: [] }), { status: 200, headers: { 'content-type': 'application/json' } })));
});
afterEach(async () => { await app?.close(); app = null; vi.unstubAllGlobals(); });

const start = () => {
  const root = temp();
  const dir = path.join(root, 'accounts', '1');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ id: 'pa', name: 'A', ftpW: 200 }));
  fs.writeFileSync(path.join(dir, 'moved.json'), JSON.stringify({ atMs: 1 }));
  const spawnFn = vi.fn(() => { throw new Error('no python in tests'); });
  const household = new Household({
    root, secretKey: Buffer.alloc(32, 7), runDir: temp(), python: process.execPath, garminScripts: path.join(root, 'scripts'),
    apiUrl: 'http://api.test:8081', internalToken: TOKEN, ask: async () => { throw new Error('no Claude in tests'); }, nowMs: () => NOON,
    spawnFn: spawnFn as never, fetchFn: (async () => new Response('{}')) as never, waitMs: 0,
  });
  app = buildCoachServer({ household, internalToken: TOKEN, nowMs: () => NOON });
  const put = (rideId: string, body: unknown, account = '1') => app!.inject({
    method: 'PUT', url: `/rides/${encodeURIComponent(rideId)}`, payload: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-pandafit-internal': TOKEN, 'x-pandafit-account': account },
  });
  return { household, rides: path.join(dir, 'rides'), put, spawnFn };
};
const names = (dir: string) => fs.readdirSync(dir).sort();

test('a finished ride is stored in the recorder layout and the account\'s coach summarizes it', async () => {
  const t = start();
  const files = filesOf();
  const res = await t.put(RID, uploadOf(files));
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ sha256: rideHash(files), same: false });
  expect(names(path.join(t.rides, RID))).toEqual(['events.jsonl', 'meta.json', 'samples.jsonl', 'session.json']);
  expect(readRideUpload(t.rides, RID).files).toEqual(files);
  expect(t.household.account(1)!.runtime.coachState('pa')!.summaries.map((s) => s.rideId)).toEqual([RID]);
});

test('the same upload twice answers same: true and writes nothing', async () => {
  const t = start();
  const up = uploadOf(filesOf());
  await t.put(RID, up);
  const before = fs.statSync(path.join(t.rides, RID, 'meta.json')).mtimeMs;
  const again = await t.put(RID, up);
  expect(again.json()).toEqual({ sha256: up.sha256, same: true });
  expect(names(t.rides)).toEqual(['exports', RID]);
  expect(fs.statSync(path.join(t.rides, RID, 'meta.json')).mtimeMs).toBe(before);
});

test('a changed upload keeps the old copy as <rideId>.replaced-<ms>', () => {
  const t = start();
  const first = filesOf();
  const second = filesOf({ power: 150 });
  expect(storeRide({ ridesDir: t.rides, profileId: 'pa', upload: uploadOf(first), nowMs: 111 })).toMatchObject({ ok: true, same: false });
  expect(storeRide({ ridesDir: t.rides, profileId: 'pa', upload: uploadOf(second), nowMs: 222 })).toMatchObject({ ok: true, same: false });
  expect(names(t.rides)).toEqual(['exports', RID, `${RID}.replaced-222`]);
  expect(fs.readFileSync(path.join(t.rides, `${RID}.replaced-222`, 'samples.jsonl'), 'utf8')).toBe(first['samples.jsonl']);
  expect(fs.readFileSync(path.join(t.rides, RID, 'samples.jsonl'), 'utf8')).toBe(second['samples.jsonl']);
});

test('an open or discarded ride is refused with open', async () => {
  const t = start();
  for (const status of ['open', 'discarded']) {
    const res = await t.put(RID, uploadOf(filesOf({ status })));
    expect([res.statusCode, res.json()]).toEqual([409, { reason: 'open' }]);
  }
  expect(fs.existsSync(path.join(t.rides, RID))).toBe(false);
});

test('a ride of another profile id is refused with profile', async () => {
  const t = start();
  const res = await t.put(RID, uploadOf(filesOf({ profileId: 'pb' })));
  expect([res.statusCode, res.json()]).toEqual([409, { reason: 'profile' }]);
  expect(fs.existsSync(path.join(t.rides, RID))).toBe(false);
});

test('a wrong hash, the ride id ../x or a body over 32 MiB is refused and nothing is written', async () => {
  const t = start();
  const files = filesOf();
  expect((await t.put(RID, uploadOf(files, { sha256: 'f'.repeat(64) }))).json()).toEqual({ reason: 'hash' });
  expect((await t.put('../x', uploadOf(files, { rideId: '../x' }))).statusCode).toBe(409);
  expect((await t.put(RID, uploadOf(files, { rideId: 'ride-1' }))).statusCode).toBe(409);
  expect(storeRide({ ridesDir: t.rides, profileId: 'pa', upload: uploadOf(files, { rideId: '../x' }), nowMs: 1 })).toEqual({ ok: false, reason: 'invalid' });
  const big = await t.put(RID, `{"pad":"${'a'.repeat(33 * 1024 * 1024)}"}`);
  expect(big.statusCode).toBe(413);
  expect(fs.existsSync(t.rides) ? names(t.rides).filter((n) => n !== 'exports') : []).toEqual([]);
  expect(fs.existsSync(path.join(t.rides, 'exports')) ? names(path.join(t.rides, 'exports')) : []).toEqual([]);
  expect(fs.existsSync(path.join(t.rides, '..', 'x'))).toBe(false);
});

test('without a FIT file one is made from the samples', async () => {
  const t = start();
  await t.put(RID, uploadOf(filesOf()));
  expect(fs.statSync(path.join(t.rides, 'exports', `${RID}.fit`)).size).toBeGreaterThan(0);
});

test('a FIT file from the Mac is kept as it is', async () => {
  const t = start();
  await t.put(RID, uploadOf(filesOf(), { fit: Buffer.from('fit-bytes').toString('base64') }));
  expect(fs.readFileSync(path.join(t.rides, 'exports', `${RID}.fit`), 'utf8')).toBe('fit-bytes');
});

test('a crash between the temp folder and the rename leaves no half ride the coach reads', async () => {
  const t = start();
  const files = filesOf();
  fs.mkdirSync(path.join(t.rides, `.incoming-${RID}`), { recursive: true });
  for (const [n, text] of Object.entries(files)) fs.writeFileSync(path.join(t.rides, `.incoming-${RID}`, n), text);
  // A replaced copy of an earlier version is a ride folder too, in disguise.
  fs.cpSync(path.join(t.rides, `.incoming-${RID}`), path.join(t.rides, `${RID}.replaced-5`), { recursive: true });
  t.household.account(1)!.runtime.scan();
  expect(t.household.account(1)!.runtime.coachState('pa')!.summaries).toEqual([]);
  // The next upload cleans the leftover and stores the ride.
  expect((await t.put(RID, uploadOf(files))).statusCode).toBe(200);
  expect(fs.existsSync(path.join(t.rides, `.incoming-${RID}`))).toBe(false);
  expect(t.household.account(1)!.runtime.coachState('pa')!.summaries).toHaveLength(1);
});

test('storing a ride never starts a Garmin upload', async () => {
  const t = start();
  await t.put(RID, uploadOf(filesOf()));
  expect(t.spawnFn).not.toHaveBeenCalled();
  expect(t.household.account(1)!.runtime.coachState('pa')!.garminUpload?.rides ?? {}).toEqual({});
});

test('the route needs the internal token', async () => {
  const t = start();
  const res = await app!.inject({ method: 'PUT', url: `/rides/${RID}`, payload: '{}', headers: { 'content-type': 'application/json' } });
  expect(res.statusCode).toBe(401);
  expect((await t.put(RID, uploadOf(filesOf()), '2')).statusCode).toBe(404);
});

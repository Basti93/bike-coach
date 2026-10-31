import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildServer } from '../../server/index';
import { RideRecorder } from '../../src/service/recorder';
import { SyncClient } from '../../src/service/sync';

const sample = (seq: number) => ({ seq, wallClockMs: seq, rideElapsedS: seq + 1, powerW: 1, cadenceRpm: 1, speedKph: 1, hrBpm: null, targetW: 1, gradePct: null, gear: null });
const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-'));
  const rec = RideRecorder.create(dir, { rideId: 'r', profileId: 'p', sessionId: 's', startedAtMs: 1, status: 'open' });
  return { dir, rec };
};
const serve = async () => {
  const app = buildServer({ dbPath: ':memory:', token: 't' });
  const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  return { app, baseUrl };
};
const remote = async (baseUrl: string) => (await fetch(`${baseUrl}/rides/r/samples`, { headers: { authorization: 'Bearer t' } })).json() as Promise<{ seq: number }[]>;

test('resumes from lastSeq after partial upload', async () => {
  const { dir, rec } = setup(); const { app, baseUrl } = await serve();
  rec.append(sample(0));
  const c = new SyncClient({ baseUrl, token: 't', dir });
  await c.syncAll();
  rec.append(sample(1)); rec.append(sample(2));
  await c.syncAll();
  expect((await remote(baseUrl)).map((s) => s.seq)).toEqual([0, 1, 2]);
  await app.close();
});
test('server down leaves local ride untouched and does not throw', async () => {
  const { dir, rec } = setup();
  rec.append(sample(0));
  await expect(new SyncClient({ baseUrl: 'http://127.0.0.1:1', token: 't', dir }).syncAll()).resolves.toBeUndefined();
  expect(fs.readFileSync(path.join(dir, 'r', 'samples.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
});
test('sync retried mid-upload converges to exactly once', async () => {
  const { dir, rec } = setup(); const { app, baseUrl } = await serve();
  for (let i = 0; i < 5; i++) rec.append(sample(i));
  const c = new SyncClient({ baseUrl, token: 't', dir, batchSize: 2 });
  const real = globalThis.fetch; let posts = 0;
  globalThis.fetch = (async (...a: Parameters<typeof fetch>) => {
    if (a[1]?.method === 'POST' && ++posts === 2) throw new Error('netz weg');
    return real(...a);
  }) as typeof fetch;
  await c.syncAll();
  globalThis.fetch = real;
  await c.syncAll(); await c.syncAll();
  expect((await remote(baseUrl)).map((s) => s.seq)).toEqual([0, 1, 2, 3, 4]);
  await app.close();
});
test('finished ride status reaches server', async () => {
  const { dir, rec } = setup(); const { app, baseUrl } = await serve();
  rec.append(sample(0)); rec.finish('finished');
  await new SyncClient({ baseUrl, token: 't', dir }).syncAll();
  const rides = await (await fetch(`${baseUrl}/profiles/p/rides`, { headers: { authorization: 'Bearer t' } })).json() as { status: string }[];
  expect(rides[0].status).toBe('finished');
  await app.close();
});
test('finished rides are not requested again, even after a restart', async () => {
  const { dir, rec } = setup(); const { app, baseUrl } = await serve();
  rec.append(sample(0)); rec.finish('finished');
  await new SyncClient({ baseUrl, token: 't', dir }).syncAll();
  const real = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async (...a: Parameters<typeof fetch>) => { calls++; return real(...a); }) as typeof fetch;
  await new SyncClient({ baseUrl, token: 't', dir }).syncAll();
  globalThis.fetch = real;
  expect(calls).toBe(0);
  await app.close();
});
test('one unreadable ride does not stop the others', async () => {
  const { dir, rec } = setup(); const { app, baseUrl } = await serve();
  rec.append(sample(0));
  fs.mkdirSync(path.join(dir, 'a-bad'));
  fs.writeFileSync(path.join(dir, 'a-bad', 'meta.json'), '{');
  await new SyncClient({ baseUrl, token: 't', dir }).syncAll();
  expect(await remote(baseUrl)).toHaveLength(1);
  await app.close();
});

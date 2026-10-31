import { buildServer } from '../../server/index';
const auth = { authorization: 'Bearer secret' };
const sample = (seq: number) => ({ seq, wallClockMs: seq, rideElapsedS: seq + 1, powerW: 1, cadenceRpm: 1, speedKph: 1, hrBpm: null, targetW: 1, gradePct: null, gear: null });
const app = () => buildServer({ dbPath: ':memory:', token: 'secret' });

test('rejects missing token', async () => {
  const a = app();
  expect((await a.inject({ url: '/rides/r/progress' })).statusCode).toBe(401);
});
test('empty ride reports -1', async () => {
  const a = app();
  expect((await a.inject({ url: '/rides/r/progress', headers: auth })).json()).toEqual({ lastSeq: -1, eventCount: 0 });
});
test('duplicate samples are stored once', async () => {
  const a = app();
  const payload = [sample(0), sample(1)];
  for (let i = 0; i < 2; i++) await a.inject({ method: 'POST', url: '/rides/r/samples', headers: auth, payload });
  expect((await a.inject({ url: '/rides/r/samples', headers: auth })).json()).toHaveLength(2);
  expect((await a.inject({ url: '/rides/r/progress', headers: auth })).json().lastSeq).toBe(1);
});
test('lists rides per profile with latest status', async () => {
  const a = app();
  const meta = { rideId: 'r', profileId: 'p', sessionId: 's', startedAtMs: 1, status: 'open' };
  await a.inject({ method: 'PUT', url: '/rides/r/meta', headers: auth, payload: meta });
  await a.inject({ method: 'PUT', url: '/rides/r/meta', headers: auth, payload: { ...meta, status: 'finished' } });
  expect((await a.inject({ url: '/profiles/p/rides', headers: auth })).json()).toEqual([{ ...meta, status: 'finished' }]);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findOpenRides, resumePoint } from '../../src/service/recovery';
import { readRide, RideRecorder } from '../../src/service/recorder';

const sample = (seq: number) => ({ seq, wallClockMs: seq, rideElapsedS: seq + 1, powerW: 1, cadenceRpm: 1, speedKph: 1, hrBpm: null, targetW: 1, gradePct: null, gear: null });
test('open ride yields resume point from last sample', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
  const rec = RideRecorder.create(dir, { rideId: 'a', profileId: 'p', sessionId: 's', startedAtMs: 1, status: 'open' });
  rec.append(sample(0)); rec.append(sample(1));
  RideRecorder.create(dir, { rideId: 'b', profileId: 'p', sessionId: 's', startedAtMs: 1, status: 'open' }).finish('finished');
  expect(findOpenRides(dir).map((m) => m.rideId)).toEqual(['a']);
  expect(resumePoint(readRide(dir, 'a'))).toEqual({ resumeAtS: 2, startSeq: 2 });
});
test('ride without samples resumes at the start', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
  RideRecorder.create(dir, { rideId: 'a', profileId: 'p', sessionId: 's', startedAtMs: 1, status: 'open' });
  expect(resumePoint(readRide(dir, 'a'))).toEqual({ resumeAtS: 0, startSeq: 0 });
});
test('foreign entries in the data dir are ignored', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
  fs.mkdirSync(path.join(dir, 'exports'));
  fs.writeFileSync(path.join(dir, 'profiles.json'), '[]');
  expect(findOpenRides(dir)).toEqual([]);
});

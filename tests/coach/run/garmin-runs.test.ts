import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { GarminDb } from '../../../src/coach/garmin-db';
import { garminRuns, type PaceCache } from '../../../src/coach/run/garmin-runs';
import { buildFit, zipOf } from './fixtures';

const band = { fromBpm: 114, toBpm: 143 };
const make = () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'runs-')), 'garmin.db');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE activities (activity_id TEXT PRIMARY KEY, start_time TEXT, sport TEXT, json TEXT, fetched_at TEXT);
    CREATE TABLE activity_files (activity_id TEXT PRIMARY KEY, format TEXT, data BLOB, fetched_at TEXT);`);
  let n = 0;
  const act = (id: string, sport: string, extra: Record<string, unknown> = {}, fit?: Uint8Array) => {
    const day = String(10 + n++).padStart(2, '0');
    const a = { activityId: id, startTimeGMT: `2026-01-${day} 08:00:00`, beginTimestamp: Date.UTC(2026, 0, +day, 8), activityType: { typeKey: sport }, duration: 2400, distance: 6000, ...extra };
    db.prepare('INSERT INTO activities VALUES (?,?,?,?,?)').run(id, a.startTimeGMT, sport, JSON.stringify(a), 't');
    if (fit) db.prepare('INSERT INTO activity_files VALUES (?,?,?,?)').run(id, 'zip', zipOf('x.fit', fit, 8), 't');
  };
  return { file, act };
};
const easyFit = buildFit(900, () => ({ hr: 130, speed: 1000 / 360, temp: 8 }));

test('only the four run types count; walking and hiking do not', () => {
  const { file, act } = make();
  for (const s of ['running', 'trail_running', 'track_running', 'treadmill_running', 'walking', 'hiking', 'cycling']) act(`p${s}`, s);
  expect(garminRuns(new GarminDb(file), 0, band, {}).map((r) => r.type)).toEqual(['running', 'trail_running', 'track_running', 'treadmill_running']);
});
test('trail and treadmill runs get no easy pace but count with distance and time', () => {
  const { file, act } = make();
  act('pa', 'trail_running', { elevationGain: 120 }, easyFit);
  act('pb', 'treadmill_running', {}, easyFit);
  const runs = garminRuns(new GarminDb(file), 0, band, {});
  expect(runs.map((r) => r.easyPace)).toEqual([null, null]);
  expect(runs[0]).toMatchObject({ source: 'garmin', distanceM: 6000, durationS: 2400, elevationGainM: 120, hasHr: true });
  expect(runs[1].best30M).toBeNull();
});
test('a road run gets its easy pace, best 30 minutes and temperature', () => {
  const { file, act } = make();
  act('pa', 'running', {}, easyFit);
  const [r] = garminRuns(new GarminDb(file), 0, band, {});
  expect(r.easyPace).toEqual({ sPerKm: 360, seconds: 599 });
  expect(r.tempC).toBe(8);
  expect(r.best30M).toBeNull(); // only 15 minutes long
});
test('a run without a FIT counts with easyPace null and hasHr from avgHr', () => {
  const { file, act } = make();
  act('pa', 'running', { averageHR: 140 });
  act('pb', 'running');
  const runs = garminRuns(new GarminDb(file), 0, band, {});
  expect(runs.map((r) => [r.easyPace, r.hasHr, r.distanceM])).toEqual([[null, true, 6000], [null, false, 6000]]);
});
test('without a band there is no easy pace', () => {
  const { file, act } = make();
  act('pa', 'running', {}, easyFit);
  expect(garminRuns(new GarminDb(file), 0, null, {})[0]).toMatchObject({ easyPace: null, hasHr: true });
});
test('the pace cache is used: a second call does not read the file again', () => {
  const { file, act } = make();
  act('pa', 'running', {}, easyFit);
  const db = new GarminDb(file);
  const spy = vi.spyOn(db, 'activityFile');
  const cache: PaceCache = {};
  const first = garminRuns(db, 0, band, cache);
  const second = garminRuns(db, 0, band, cache);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(second).toEqual(first);
  garminRuns(db, 0, { fromBpm: 100, toBpm: 120 }, cache);
  expect(spy).toHaveBeenCalledTimes(2);
});
test('a broken file counts for kilometres and time and does not throw', () => {
  const { file, act } = make();
  act('pa', 'running', { averageHR: 150 });
  new DatabaseSync(file).prepare('INSERT INTO activity_files VALUES (?,?,?,?)').run('pa', 'zip', Buffer.from('PK\u0003\u0004junk'), 't');
  expect(garminRuns(new GarminDb(file), 0, band, {})[0]).toMatchObject({ easyPace: null, hasHr: true, distanceM: 6000 });
});
test('Garmin not there: a missing database file gives []', () => {
  const missing = path.join(os.tmpdir(), 'no-such-dir-xyz', 'garmin.db');
  expect(garminRuns(new GarminDb(missing), 0, band, {})).toEqual([]);
  expect(new GarminDb(missing).activityFile('pa')).toBeNull();
});

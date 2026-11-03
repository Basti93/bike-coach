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
const putFile = (file: string, id: string, data: Uint8Array) => new DatabaseSync(file).prepare('INSERT OR REPLACE INTO activity_files VALUES (?,?,?,?)').run(id, 'zip', data, 't');
test('a broken but complete file counts for kilometres and time, does not throw, and is cached', () => {
  const { file, act } = make();
  act('pa', 'running', { averageHR: 150 });
  putFile(file, 'pa', zipOf('x.fit', Buffer.from('this is not a fit file at all'), 0));
  const db = new GarminDb(file);
  const spy = vi.spyOn(db, 'activityFile');
  const cache: PaceCache = {};
  expect(garminRuns(db, 0, band, cache)[0]).toMatchObject({ easyPace: null, hasHr: true, distanceM: 6000 });
  garminRuns(db, 0, band, cache);
  expect(spy).toHaveBeenCalledTimes(1);
});
test('a run without a file is not cached, so a file arriving later is picked up', () => {
  const { file, act } = make();
  act('pa', 'running', { averageHR: 150 });
  const cache: PaceCache = {};
  expect(garminRuns(new GarminDb(file), 0, band, cache)[0].easyPace).toBeNull();
  expect(cache).toEqual({});
  putFile(file, 'pa', zipOf('x.fit', easyFit, 8));
  expect(garminRuns(new GarminDb(file), 0, band, cache)[0].easyPace).not.toBeNull();
});
test('a file that looks cut off (still syncing) is not cached', () => {
  const { file, act } = make();
  act('pa', 'running');
  const z = zipOf('x.fit', easyFit, 8);
  putFile(file, 'pa', z.subarray(0, z.length - 40));
  const cache: PaceCache = {};
  expect(garminRuns(new GarminDb(file), 0, band, cache)[0]).toMatchObject({ easyPace: null, hasHr: false });
  expect(cache).toEqual({});
});
test('a band change reads a road run again for the pace only, and a trail run not at all', () => {
  const { file, act } = make();
  act('pa', 'running', {}, easyFit);
  act('pb', 'trail_running', {}, easyFit);
  const db = new GarminDb(file);
  const spy = vi.spyOn(db, 'activityFile');
  const cache: PaceCache = {};
  garminRuns(db, 0, band, cache);
  expect(spy).toHaveBeenCalledTimes(2);
  const runs = garminRuns(db, 0, { fromBpm: 100, toBpm: 120 }, cache);
  expect(spy).toHaveBeenCalledTimes(3);
  expect(runs.map((r) => r.hasHr)).toEqual([true, true]);
});
test('cache entries of runs that left the window or of an old band are pruned', () => {
  const { file, act } = make();
  act('pa', 'running', {}, easyFit);
  act('pb', 'running', {}, easyFit);
  const db = new GarminDb(file);
  const cache: PaceCache = {};
  garminRuns(db, 0, band, cache);
  garminRuns(db, 0, { fromBpm: 100, toBpm: 120 }, cache);
  expect(Object.keys(cache).sort()).toEqual(['pa', 'pa:100-120', 'pb', 'pb:100-120']);
  garminRuns(db, Date.UTC(2026, 0, 11, 0), { fromBpm: 100, toBpm: 120 }, cache);
  expect(Object.keys(cache).sort()).toEqual(['pb', 'pb:100-120']);
});
test('all-zero heart rate in the file is no heart rate', () => {
  const { file, act } = make();
  act('pa', 'running', {}, buildFit(900, () => ({ hr: 0, speed: 3 })));
  expect(garminRuns(new GarminDb(file), 0, band, {})[0]).toMatchObject({ hasHr: false, easyPace: null });
});
test('Garmin not there: a missing database file gives []', () => {
  const missing = path.join(os.tmpdir(), 'no-such-dir-xyz', 'garmin.db');
  expect(garminRuns(new GarminDb(missing), 0, band, {})).toEqual([]);
  expect(new GarminDb(missing).activityFile('pa')).toBeNull();
});

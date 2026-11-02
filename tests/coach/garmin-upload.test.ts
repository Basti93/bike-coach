import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canUpload, dueAutoUploads, RETRY_UPLOAD_MS, uploadSettings, withUploadSettings } from '../../src/coach/garmin-upload';
import { GarminUploader, type UploadResult } from '../../src/coach/garmin-uploader';
import { externalLoad } from '../../src/coach/readiness';
import type { RideSummary } from '../../src/coach/metrics';
import { loadState, saveState, type CoachState } from '../../src/coach/state';

const summary = (rideId: string, startedAtMs: number, durationS = 1800) => ({ rideId, startedAtMs, durationS }) as RideSummary;
const state = (over: Partial<CoachState> = {}) => ({ summaries: [summary('old', 100), summary('new', 2000)], ...over }) as CoachState;
const auto = (rides = {}, minMinutes = 10) => ({ mode: 'auto' as const, minMinutes, enabledAtMs: 1000, rides });

test('uploading is off until it is switched on', () => {
  expect(uploadSettings(state())).toMatchObject({ mode: 'off', enabledAtMs: null, rides: {} });
  expect(dueAutoUploads(state(), 5000)).toEqual([]);
  expect(dueAutoUploads(state({ garminUpload: { ...auto(), mode: 'off' } }), 5000)).toEqual([]);
});
test('asking mode has nothing due', () => {
  expect(dueAutoUploads(state({ garminUpload: { ...auto(), mode: 'ask' } }), 5000)).toEqual([]);
});
test('automatic only takes rides started after switching it on', () => {
  expect(dueAutoUploads(state({ garminUpload: auto() }), 5000)).toEqual(['new']);
});
test('automatic skips rides under the minimum', () => {
  expect(dueAutoUploads(state({ garminUpload: auto({}, 60) }), 5000)).toEqual([]);
});
test('uploaded and running rides are not due', () => {
  for (const status of ['uploaded', 'uploading'] as const) expect(dueAutoUploads(state({ garminUpload: auto({ new: { status, atMs: 1 } }) }), RETRY_UPLOAD_MS * 9)).toEqual([]);
});
test('a failed ride is due again after an hour', () => {
  const s = state({ garminUpload: auto({ new: { status: 'failed', atMs: 1000, reason: 'failed' } }) });
  expect(dueAutoUploads(s, 1000 + RETRY_UPLOAD_MS - 1)).toEqual([]);
  expect(dueAutoUploads(s, 1000 + RETRY_UPLOAD_MS)).toEqual(['new']);
});
test('expired login or a missing file waits for the button', () => {
  for (const reason of ['reauth', 'missing-file']) expect(dueAutoUploads(state({ garminUpload: auto({ new: { status: 'failed', atMs: 1, reason } }) }), RETRY_UPLOAD_MS * 9)).toEqual([]);
});
test('switching to automatic starts the clock, changing the minimum does not', () => {
  const a = withUploadSettings(state(), 'auto', 10, 7000);
  expect(a.enabledAtMs).toBe(7000);
  const b = withUploadSettings(state({ garminUpload: a }), 'auto', 20, 9000);
  expect(b).toMatchObject({ enabledAtMs: 7000, minMinutes: 20 });
  expect(withUploadSettings(state({ garminUpload: b }), 'off', 20, 9500).enabledAtMs).toBeNull();
});
test('the minimum stays within sensible bounds', () => {
  expect(withUploadSettings(state(), 'auto', -5, 1).minMinutes).toBe(0);
  expect(withUploadSettings(state(), 'auto', 99999, 1).minMinutes).toBe(240);
  expect(withUploadSettings(state(), 'auto', Number.NaN, 1).minMinutes).toBe(10);
});
test('the button works in any mode, for known rides that are not up yet', () => {
  expect(canUpload(state(), 'new')).toBe(true);
  expect(canUpload(state(), 'unbekannt')).toBe(false);
  expect(canUpload(state({ garminUpload: auto({ new: { status: 'uploaded', atMs: 1 } }) }), 'new')).toBe(false);
  expect(canUpload(state({ garminUpload: auto({ new: { status: 'uploading', atMs: 1 } }) }), 'new')).toBe(false);
  expect(canUpload(state({ garminUpload: auto({ new: { status: 'failed', atMs: 1 } }) }), 'new')).toBe(true);
});
test('an upload cut off by a restart counts as failed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-'));
  const s = loadState(dir, 'pa', 200, 1);
  s.garminUpload = auto({ new: { status: 'uploading', atMs: 1 }, done: { status: 'uploaded', atMs: 1 } });
  saveState(dir, s);
  const rides = loadState(dir, 'pa', 200, 1).garminUpload?.rides;
  expect(rides?.new).toMatchObject({ status: 'failed', reason: 'failed' });
  expect(rides?.done.status).toBe('uploaded');
});
test('a ride uploaded to Garmin does not count again as load', () => {
  const activity = { id: 'g', sport: 'cycling', startMs: 86_400_000 * 100, durationS: 1800, trainingLoad: 40, name: null, avgHr: null };
  const ride = { ...summary('r', activity.startMs), status: 'finished' } as RideSummary;
  expect(externalLoad([activity] as never, [ride], activity.startMs + 3600_000)).toEqual([]);
});

describe('uploader', () => {
  const fake = () => {
    const children: (EventEmitter & { stdout: EventEmitter; kill: () => void })[] = [];
    const spawnFn = vi.fn(() => {
      const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), kill: vi.fn() });
      children.push(child);
      return child;
    });
    return { children, spawnFn };
  };
  const make = (rideOpen = false) => {
    const f = fake();
    const results: [string, string, UploadResult][] = [];
    const up = new GarminUploader({ python: 'py', script: 's.py', baseDir: '/g', exportsDir: '/x', rideOpen: () => rideOpen, onResult: (p, r, x) => results.push([p, r, x]), spawnFn: f.spawnFn as never });
    return { ...f, results, up };
  };
  const finish = (c: ReturnType<typeof fake>['children'][number], line: string) => { c.stdout.emit('data', Buffer.from(`${line}\n`)); c.emit('close', 0); };

  test('runs the script with the tokens and file of that ride', () => {
    const { up, spawnFn } = make();
    expect(up.upload('pa', 'ride-1-a')).toBe(true);
    expect(spawnFn).toHaveBeenCalledWith('py', ['s.py', '--tokens', path.join('/g', 'tokens', 'pa'), '--file', path.join('/x', 'ride-1-a.fit')], expect.anything());
  });
  test('rejects ids that could leave the folder', () => {
    const { up, spawnFn } = make();
    expect(up.upload('pa', '../../etc/passwd')).toBe(false);
    expect(up.upload('../pa', 'ride-1')).toBe(false);
    expect(spawnFn).not.toHaveBeenCalled();
  });
  test('does nothing while a ride is open', () => {
    const { up, spawnFn } = make(true);
    expect(up.upload('pa', 'ride-1')).toBe(false);
    expect(spawnFn).not.toHaveBeenCalled();
  });
  test('one upload per profile at a time', () => {
    const { up, spawnFn, children } = make();
    up.upload('pa', 'ride-1');
    expect(up.upload('pa', 'ride-2')).toBe(false);
    expect(up.upload('pb', 'ride-3')).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(2);
    finish(children[0], '{"status":"uploaded"}');
    expect(up.upload('pa', 'ride-2')).toBe(true);
  });
  test('a duplicate counts as uploaded', () => {
    const { up, children, results } = make();
    up.upload('pa', 'ride-1');
    finish(children[0], '{"status":"duplicate"}');
    expect(results).toEqual([['pa', 'ride-1', { status: 'uploaded' }]]);
  });
  test('reports the reason of a failure', () => {
    const { up, children, results } = make();
    up.upload('pa', 'ride-1');
    finish(children[0], '{"status":"failed","reason":"reauth"}');
    expect(results[0][2]).toEqual({ status: 'failed', reason: 'reauth' });
  });
  test('unreadable output or a crash is a failure, reported once', () => {
    const { up, children, results } = make();
    up.upload('pa', 'ride-1');
    children[0].stdout.emit('data', Buffer.from('Quatsch\n'));
    children[0].emit('error', new Error('weg'));
    children[0].emit('close', 1);
    expect(results).toEqual([['pa', 'ride-1', { status: 'failed', reason: 'failed' }]]);
  });
});

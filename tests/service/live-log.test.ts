import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { undoLastLive } from '../../scripts/live-undo';
import { FakeBlePort } from '../../src/service/ble/fake-device';
import { LiveLog } from '../../src/service/live-log';
import { readRide } from '../../src/service/recorder';
import { RideService } from '../../src/service/ride-service';

const session = { id: 's', name: 'x', steps: [{ kind: 'erg' as const, durationS: 100, ftpFraction: 0.5, label: 'A' }] };
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'live-'));

test('live log receives samples and markers', () => {
  const dir = temp(); let t = 0;
  const log = new LiveLog(dir);
  const svc = new RideService({ dir, ble: new FakeBlePort(), nowMs: () => t, onLive: (l) => log.write(l) });
  svc.handle({ type: 'start', profileId: 'A', session, ftpW: 200 });
  svc.handle({ type: 'mark', note: 'Puls' });
  t += 1000; svc.tick();
  const lines = fs.readFileSync(path.join(dir, 'live', 'current.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  expect(lines.some((l) => l.type === 'marker' && l.detail === 'Puls')).toBe(true);
  expect(lines.some((l) => l.seq === 0)).toBe(true);
  svc.close();
});
test('live log failure never affects recording', () => {
  const dir = temp(); let t = 0;
  const svc = new RideService({ dir, ble: new FakeBlePort(), nowMs: () => t, onLive: () => { throw new Error('voll'); } });
  svc.handle({ type: 'start', profileId: 'A', session, ftpW: 200 });
  svc.handle({ type: 'mark' });
  t += 1000; svc.tick();
  const id = fs.readdirSync(dir).find((n) => n.startsWith('ride-'))!;
  expect(readRide(dir, id).samples).toHaveLength(1);
  expect(readRide(dir, id).events).toHaveLength(1);
  svc.close();
});
test('LiveLog swallows write errors', () => {
  const file = path.join(temp(), 'blocked');
  fs.writeFileSync(file, '');
  expect(() => new LiveLog(file).write({ a: 1 })).not.toThrow();
});
test('undo reverts last live commit', () => {
  const repo = temp();
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', repo, ...a], { stdio: 'pipe' }).toString();
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'a'), '1'); git('add', '.'); git('commit', '-qm', 'base');
  fs.writeFileSync(path.join(repo, 'a'), '2'); git('add', '.'); git('commit', '-qm', 'live: first');
  fs.writeFileSync(path.join(repo, 'b'), 'x'); git('add', '.'); git('commit', '-qm', 'live: second');
  undoLastLive(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t']);
  expect(fs.existsSync(path.join(repo, 'b'))).toBe(false);
  expect(fs.readFileSync(path.join(repo, 'a'), 'utf8')).toBe('2');
});
test('undo refuses when no live commit exists', () => {
  const repo = temp();
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', repo, ...a], { stdio: 'pipe' });
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'a'), '1'); git('add', '.'); git('commit', '-qm', 'base');
  expect(() => undoLastLive(repo)).toThrow(/live:/);
});

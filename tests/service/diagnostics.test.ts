import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FakeBlePort } from '../../src/service/ble/fake-device';
import { Diagnostics, withDiagnostics } from '../../src/service/diagnostics';
import { RideService } from '../../src/service/ride-service';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1, 12);
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'diag-'));
const lines = (dir: string, name: string) => fs.readFileSync(path.join(dir, 'diagnostics', name), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('writes the lines of a day into one file', async () => {
  const dir = temp();
  const d = new Diagnostics(dir, () => NOW);
  d.write('device', { kind: 'trainer' });
  await d.flushed();
  expect(lines(dir, 'diag-2026-11-01.jsonl')).toEqual([{ atMs: NOW, what: 'device', kind: 'trainer' }]);
});
test('keeps only today and the two days before', async () => {
  const dir = temp();
  let now = NOW;
  const d = new Diagnostics(dir, () => now);
  for (let i = 0; i < 4; i++) { d.write('x', {}); await d.flushed(); now += DAY; }
  d.write('x', {});
  await d.flushed();
  expect(fs.readdirSync(path.join(dir, 'diagnostics')).sort()).toEqual(['diag-2026-11-03.jsonl', 'diag-2026-11-04.jsonl', 'diag-2026-11-05.jsonl']);
});
test('a full or broken disk never reaches the caller', async () => {
  const dir = temp();
  fs.writeFileSync(path.join(dir, 'diagnostics'), 'ein Hindernis');
  const d = new Diagnostics(dir, () => NOW);
  expect(() => d.write('x', {})).not.toThrow();
  await expect(d.flushed()).resolves.toBeUndefined();
});
test('the report holds the note, the device status and the log', async () => {
  const dir = temp();
  const d = new Diagnostics(dir, () => NOW);
  d.write('connect', { kind: 'trainer' });
  const file = await d.report('Trainer fiel aus', { trainer: 'searching' });
  expect(path.dirname(file)).toBe(path.join(dir, 'reports'));
  const text = fs.readFileSync(file, 'utf8');
  expect(text).toContain('Trainer fiel aus');
  expect(text).toContain('"trainer":"searching"');
  expect(text).toContain('"what":"connect"');
});

describe('recording the Bluetooth traffic', () => {
  const setup = () => {
    const dir = temp(); let now = NOW;
    const d = new Diagnostics(dir, () => now);
    const fake = new FakeBlePort();
    return { dir, d, fake, port: withDiagnostics(fake, d, () => now), tick: (ms: number) => { now += ms; } };
  };
  const read = async (s: ReturnType<typeof setup>) => { await s.d.flushed(); return lines(s.dir, 'diag-2026-11-01.jsonl'); };

  test('logs connecting and writing with the raw bytes', async () => {
    const s = setup();
    await s.port.connect('trainer');
    await s.port.write('trainer', Buffer.from([0x05, 0xc8, 0x00]));
    expect(await read(s)).toEqual(expect.arrayContaining([
      expect.objectContaining({ what: 'connect-ok', kind: 'trainer' }),
      expect.objectContaining({ what: 'write', kind: 'trainer', hex: '05c800' }),
    ]));
  });
  test('passes every packet on, but logs at most one per second and device', async () => {
    const s = setup();
    const seen: Buffer[] = [];
    s.port.subscribe('hr', (b) => seen.push(b));
    await s.port.connect('hr');
    for (let i = 0; i < 5; i++) { s.fake.emit('hr', Buffer.from([0, 100 + i])); s.tick(100); }
    s.tick(1000);
    s.fake.emit('hr', Buffer.from([0, 120]));
    expect(seen).toHaveLength(6);
    expect((await read(s)).filter((l) => l.what === 'data').map((l) => l.hex)).toEqual(['0064', '0078']);
  });
  test('a failed connection is logged and still fails for the caller', async () => {
    const s = setup();
    s.fake.online.trainer = false;
    await expect(s.port.connect('trainer')).rejects.toThrow();
    expect(await read(s)).toContainEqual(expect.objectContaining({ what: 'connect-failed', kind: 'trainer' }));
  });
});

test('asking for a report during a ride does not touch the ride and answers with the path', async () => {
  const dir = temp(); let t = NOW;
  const d = new Diagnostics(dir, () => t);
  const svc = new RideService({ dir, ble: new FakeBlePort(), nowMs: () => t, diagnostics: d });
  const got: { type: string; path?: string }[] = [];
  svc.subscribe((m) => got.push(m as { type: string }));
  svc.handle({ type: 'start', profileId: 'A', session: { id: 's', name: 'x', steps: [{ kind: 'erg', durationS: 100, ftpFraction: 0.5, label: 'A' }] }, ftpW: 200 });
  svc.handle({ type: 'problem-report', note: 'Puls fehlt' });
  t += 1000; svc.tick();
  await vi.waitFor(() => expect(got.some((m) => m.type === 'report-saved')).toBe(true));
  expect(svc.isRiding()).toBe(true);
  expect(fs.readFileSync(got.find((m) => m.type === 'report-saved')!.path!, 'utf8')).toContain('Puls fehlt');
  svc.close();
});

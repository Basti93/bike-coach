import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadState, saveState } from '../../src/coach/state';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'state-'));
test('new profile starts with the ramp test and the given FTP', () => {
  const s = loadState(dir(), 'p', 150, 1000);
  expect(s.ftpW).toBe(150);
  expect(s.next.session.id).toBe('ramp-test');
  expect(s.ftpHistory).toEqual([{ atMs: 1000, ftpW: 150, source: 'manual' }]);
});
test('state survives a restart', () => {
  const d = dir();
  const s = loadState(d, 'p', 150, 1000);
  saveState(d, { ...s, ftpW: 170 });
  expect(loadState(d, 'p', 150, 2000).ftpW).toBe(170);
  expect(fs.readdirSync(d).filter((f) => f.endsWith('.tmp'))).toEqual([]);
});
test('corrupt state file is kept aside and replaced', () => {
  const d = dir();
  fs.writeFileSync(path.join(d, 'p.json'), '{"ftpW":');
  expect(loadState(d, 'p', 150, 1000).ftpW).toBe(150);
  expect(fs.readFileSync(path.join(d, 'p.json.broken'), 'utf8')).toBe('{"ftpW":');
});
test('profile id cannot escape the directory', () => {
  const d = dir();
  saveState(d, loadState(d, '../evil', 150, 1000));
  expect(fs.existsSync(path.join(d, '..', 'evil.json'))).toBe(false);
});

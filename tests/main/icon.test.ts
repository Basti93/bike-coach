import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(__dirname, '..', '..', 'resources');
test('the app icon exists as a square PNG and an icns file', () => {
  const png = fs.readFileSync(path.join(dir, 'icon.png'));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1024);
  expect(png.readUInt32BE(20)).toBe(1024);
  expect(fs.readFileSync(path.join(dir, 'icon.icns')).subarray(0, 4).toString()).toBe('icns');
});
test('the main process puts the icon in the Dock and survives a missing file', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main', 'index.ts'), 'utf8');
  expect(main).toContain("'resources', 'icon.png'");
  expect(main).toMatch(/isEmpty\(\)/);
  expect(main).toContain('dock?.setIcon');
});

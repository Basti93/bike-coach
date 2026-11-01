import { guiPath, unpacked } from '../../src/main/app-paths';

test('a script inside the package is read from where Python can reach it', () => {
  expect(unpacked('/A/Contents/Resources/app.asar/scripts/garmin/bridge.py')).toBe('/A/Contents/Resources/app.asar.unpacked/scripts/garmin/bridge.py');
  expect(unpacked('/repo/scripts/garmin/bridge.py')).toBe('/repo/scripts/garmin/bridge.py');
});
test('an app started from the Finder still finds claude and friends', () => {
  const p = guiPath('/usr/bin:/bin', '/Users/x').split(':');
  expect(p).toContain('/Users/x/.local/bin');
  expect(p).toContain('/opt/homebrew/bin');
  expect(p).toContain('/usr/bin');
});
test('nothing is listed twice', () => {
  const p = guiPath('/opt/homebrew/bin:/usr/bin', '/Users/x').split(':');
  expect(new Set(p).size).toBe(p.length);
});

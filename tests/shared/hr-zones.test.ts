import { hrMaxFor, stepTargetZone, zoneBounds, zoneOf } from '../../src/shared/hr-zones';

const NOW = Date.parse('2026-11-01');
test('your own maximum wins over the estimate', () => {
  expect(hrMaxFor({ hrMaxBpm: 190, birthDate: '1990-01-15' }, NOW)).toEqual({ bpm: 190, estimated: false });
});
test('without one it is estimated from age and marked as such', () => {
  expect(hrMaxFor({ birthDate: '1990-01-15' }, NOW)).toEqual({ bpm: 183, estimated: true });
});
test('without age or maximum there are no zones', () => {
  expect(hrMaxFor({}, NOW)).toBeNull();
});
test('five zones in tens of percent of the maximum', () => {
  expect(zoneBounds(2, 200)).toEqual({ fromBpm: 120, toBpm: 140 });
  expect(zoneOf(99, 200)).toBe(0);
  expect(zoneOf(100, 200)).toBe(1);
  expect(zoneOf(139, 200)).toBe(2);
  expect(zoneOf(140, 200)).toBe(3);
  expect(zoneOf(195, 200)).toBe(5);
});
test('a section takes the zone the coach set, otherwise one matching its watts', () => {
  const erg = (ftpFraction: number, hrZone?: number) => ({ kind: 'erg' as const, durationS: 60, label: 'x', ftpFraction, ...(hrZone ? { hrZone } : {}) });
  expect(stepTargetZone(erg(0.5))).toBe(2);
  expect(stepTargetZone(erg(0.7))).toBe(3);
  expect(stepTargetZone(erg(0.85))).toBe(4);
  expect(stepTargetZone(erg(1))).toBe(5);
  expect(stepTargetZone(erg(1, 2))).toBe(2);
});

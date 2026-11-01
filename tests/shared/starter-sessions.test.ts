import { parseSession } from '../../src/shared/session';
import { STARTER_SESSIONS } from '../../src/shared/starter-sessions';

const test10 = () => STARTER_SESSIONS.find((s) => s.id === 'test-10')!;
test('the test ride lasts exactly 10 minutes and is valid', () => {
  expect(test10().steps.reduce((sum, s) => sum + s.durationS, 0)).toBe(600);
  expect(parseSession(test10()).id).toBe('test-10');
});
test('it exercises target power, a calm phase and shifting on a climb, without going hard', () => {
  const { steps } = test10();
  const erg = steps.flatMap((s) => (s.kind === 'erg' ? [s.ftpFraction] : []));
  expect(Math.max(...erg)).toBeLessThanOrEqual(0.85);
  expect(erg[0]).toBeLessThanOrEqual(0.75);
  expect(steps.some((s) => s.kind === 'grade')).toBe(true);
});

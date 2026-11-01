import { parseSession, stepFtpFraction } from '../../src/shared/session';
import { STARTER_SESSIONS } from '../../src/shared/starter-sessions';

const test10 = () => STARTER_SESSIONS.find((s) => s.id === 'test-10')!;
test('the test ride lasts exactly 10 minutes and is valid', () => {
  expect(test10().steps.reduce((sum, s) => sum + s.durationS, 0)).toBe(600);
  expect(parseSession(test10()).id).toBe('test-10');
});
test('it exercises target power, a calm phase and a climb, without going hard', () => {
  const { steps } = test10();
  const erg = steps.flatMap((s) => (s.kind === 'erg' ? [s.ftpFraction] : []));
  expect(Math.max(...erg)).toBeLessThanOrEqual(0.85);
  expect(erg[0]).toBeLessThanOrEqual(0.75);
  expect(steps.some((s) => s.kind === 'grade')).toBe(true);
});
test('its climb stays moderate for the rider', () => {
  const climb = test10().steps.find((s) => s.kind === 'grade')!;
  expect(stepFtpFraction(climb)).toBeLessThanOrEqual(0.75);
});
test('climbs get harder with grade and scale, descents stay easy', () => {
  const grade = (gradePct: number, scale = 1) => stepFtpFraction({ kind: 'grade', durationS: 60, label: 'x', gradePct, scale });
  expect(grade(3)).toBeCloseTo(0.7);
  expect(grade(6)).toBeCloseTo(0.85);
  expect(grade(5, 0.8)).toBeCloseTo(0.75);
  expect(grade(-5)).toBe(0.5);
  expect(stepFtpFraction({ kind: 'erg', durationS: 60, label: 'x', ftpFraction: 0.9 })).toBe(0.9);
});
test('no starter text asks the rider to shift', () => {
  expect(JSON.stringify(STARTER_SESSIONS)).not.toMatch(/schalt/i);
});

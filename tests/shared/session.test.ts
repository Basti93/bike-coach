import { parseSession } from '../../src/shared/session';
test('session accepts erg and grade steps', () => {
  expect(parseSession({ id: 'a', name: 'x', steps: [
    { kind: 'erg', durationS: 60, ftpFraction: 0.5, label: 'Warmup' },
    { kind: 'grade', durationS: 60, gradePct: 5, scale: 0.8, label: 'Anstieg' } ]}).steps).toHaveLength(2);
});
test('session rejects negative duration', () => {
  expect(() => parseSession({ id: 'a', name: 'x', steps: [{ kind: 'erg', durationS: -1, ftpFraction: 0.5, label: 'x' }] })).toThrow();
});

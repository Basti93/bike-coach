import { restartDelayMs } from '../../src/main/backoff';
test('restart delay grows and is capped', () => {
  expect(restartDelayMs(0)).toBe(250);
  expect(restartDelayMs(1)).toBe(500);
  expect(restartDelayMs(20)).toBe(30000);
});

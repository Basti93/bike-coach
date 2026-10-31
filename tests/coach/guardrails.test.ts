import { checkSession, type CoachContext } from '../../src/coach/guardrails';
import type { RideSummary } from '../../src/coach/metrics';
import type { Session, Step } from '../../src/shared/session';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const past = (daysAgo: number, over: Partial<RideSummary> = {}): RideSummary => ({
  rideId: `r${daysAgo}`, startedAtMs: NOW - daysAgo * DAY, status: 'finished', sessionId: 's', ftpW: 200, durationS: 3600,
  avgPowerW: 130, normalizedPowerW: 140, intensityFactor: 0.7, tss: 60, avgHrBpm: 130, maxHrBpm: 150, bestMinutePowerW: 180, completedFraction: 1, ...over,
});
const ctx = (summaries: RideSummary[] = [past(3), past(6)]): CoachContext => ({ ftpW: 200, summaries, nowMs: NOW });
const warm: Step = { kind: 'erg', durationS: 600, ftpFraction: 0.5, label: 'Warmup' };
const session = (...steps: Step[]): Session => ({ id: 'x', name: 'x', steps });
const erg = (min: number, f: number): Step => ({ kind: 'erg', durationS: min * 60, ftpFraction: f, label: 'A' });
const interval = session(warm, ...Array.from({ length: 4 }, () => [erg(4, 0.95), erg(3, 0.5)]).flat());

test('accepts a sensible session', () => expect(checkSession(interval, ctx()).ok).toBe(true));
test.each([
  ['kein Warmup', session(erg(30, 0.9))],
  ['Warmup zu kurz', session(erg(2, 0.5), erg(30, 0.6))],
  ['200 % FTP', session(warm, erg(1, 2))],
  ['5 Minuten über 105 %', session(warm, erg(5, 1.1))],
  ['20 Minuten über 95 %', session(warm, erg(20, 0.97))],
  ['3 Stunden', session(warm, erg(170, 0.5))],
  ['unter 10 Minuten', session({ ...warm, durationS: 300 }, erg(1, 0.5))],
  ['40 Minuten über 90 %', session(warm, erg(19, 0.92), erg(2, 0.5), erg(19, 0.92), erg(2, 0.5), erg(2, 0.92))],
  ['Steigung 25 %', session(warm, { kind: 'grade', durationS: 600, gradePct: 25, scale: 1, label: 'B' })],
  ['Skalierung 3', session(warm, { kind: 'grade', durationS: 600, gradePct: 5, scale: 3, label: 'B' })],
])('rejects %s', (_name, s) => expect(checkSession(s, ctx()).ok).toBe(false));
test('rejects malformed input instead of throwing', () => {
  expect(checkSession({ steps: 'x' }, ctx()).ok).toBe(false);
  expect(checkSession(null, ctx()).ok).toBe(false);
});
test('the reserved ramp id is refused from outside', () => {
  expect(checkSession({ ...interval, id: 'ramp-test' }, ctx()).ok).toBe(false);
});
test('after a hard ride yesterday only easy sessions pass', () => {
  const c = ctx([past(0.5, { intensityFactor: 0.9 })]);
  expect(checkSession(interval, c).ok).toBe(false);
  expect(checkSession(session(warm, erg(30, 0.7)), c).ok).toBe(true);
});
test('first ride without history allows only gentle sessions', () => {
  const c = ctx([]);
  expect(checkSession(interval, c).ok).toBe(false);
  expect(checkSession(session(warm, erg(60, 0.6)), c).ok).toBe(false);
  expect(checkSession(session(warm, erg(30, 0.65)), c).ok).toBe(true);
});
test('after a 14 day break only gentle sessions pass', () => {
  expect(checkSession(interval, ctx([past(20)])).ok).toBe(false);
});
test('estimated load may not exceed 1.5 times the strongest recent ride', () => {
  const c = ctx([past(2, { tss: 40 })]);
  expect(checkSession(session(warm, erg(100, 0.7)), c).ok).toBe(false);
});

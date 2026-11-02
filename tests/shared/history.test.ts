import { dedupeSessions, overlapsHalf } from '../../src/shared/history';
import type { LoggedWorkout } from '../../src/shared/records';

const w = (id: string, startMs: number, endMs: number | null, source: 'pandafit' | 'hevy' = 'pandafit'): LoggedWorkout =>
  ({ id, title: id, startMs, endMs, source, exercises: [] });
const H = 3_600_000;

test('overlap needs half of the shorter one', () => {
  expect(overlapsHalf({ startMs: 0, durationMs: H }, { startMs: 20 * 60_000, durationMs: H })).toBe(true);
  expect(overlapsHalf({ startMs: 0, durationMs: H }, { startMs: 50 * 60_000, durationMs: H })).toBe(false);
});
test('a Hevy session overlapping an own one is dropped, own wins; open ones are not history', () => {
  const out = dedupeSessions([w('hv', 10 * 60_000, H + 10 * 60_000, 'hevy'), w('own', 0, H), w('open', 5 * H, null), w('later', 3 * H, 4 * H, 'hevy')]);
  expect(out.map((x) => x.id).sort()).toEqual(['later', 'own']);
});
test('a forgotten workout finished at its last set does not hide a Hevy session of the next day', () => {
  const out = dedupeSessions([w('own', 0, H), w('hv', 24 * H, 25 * H, 'hevy')]);
  expect(out).toHaveLength(2);
});

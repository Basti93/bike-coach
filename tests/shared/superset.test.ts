import { contiguousGroups, dissolveSingles, tidyGroups } from '../../src/shared/superset';

const x = (n: string, supersetId: number | null) => ({ n, supersetId });
const names = (xs: { n: string }[]) => xs.map((e) => e.n).join('');

test('later members move behind the first member, the rest keeps its order', () => {
  expect(names(contiguousGroups([x('a', 0), x('b', null), x('c', 0), x('d', 1), x('e', null), x('f', 1)]))).toBe('acbdfe');
});
test('already contiguous: the same list back', () => {
  const l = [x('a', 0), x('b', 0), x('c', null)];
  expect(contiguousGroups(l)).toBe(l);
});
test('a group of one is let go', () => {
  expect(dissolveSingles([x('a', 0), x('b', null)]).map((e) => e.supersetId)).toEqual([null, null]);
  expect(names(tidyGroups([x('a', 0), x('b', 1), x('c', 0), x('d', 1), x('e', 2)]))).toBe('acbde');
});

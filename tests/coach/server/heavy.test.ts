import { HeavyLock, inQuietHours } from '../../../src/coach/server/heavy';

const at = (h: number, m = 0) => new Date(2026, 10, 3, h, m).getTime();

test('scheduled runs pause from 02:00 to 06:00', () => {
  expect(inQuietHours(at(2))).toBe(true);
  expect(inQuietHours(at(5, 59))).toBe(true);
  expect(inQuietHours(at(6))).toBe(false);
  expect(inQuietHours(at(1, 59))).toBe(false);
});

test('a window over midnight works too', () => {
  expect(inQuietHours(at(23), 22, 4)).toBe(true);
  expect(inQuietHours(at(3), 22, 4)).toBe(true);
  expect(inQuietHours(at(12), 22, 4)).toBe(false);
});

test('the lock runs one call at a time, first in, first out, and is busy while any waits', async () => {
  const lock = new HeavyLock();
  expect(lock.busy()).toBe(false);
  const order: string[] = [];
  let release!: () => void;
  const first = lock.run(() => new Promise<string>((r) => { order.push('a start'); release = () => { order.push('a end'); r('a'); }; }));
  const second = lock.run(async () => { order.push('b'); return 'b'; });
  const third = lock.run(async () => { order.push('c'); throw new Error('c failed'); });
  const fourth = lock.run(async () => { order.push('d'); return 'd'; });
  await new Promise((r) => setTimeout(r, 10));
  expect(order).toEqual(['a start']);
  expect(lock.busy()).toBe(true);
  release();
  expect(await first).toBe('a');
  expect(await second).toBe('b');
  await expect(third).rejects.toThrow('c failed');
  expect(await fourth).toBe('d');
  expect(order).toEqual(['a start', 'a end', 'b', 'c', 'd']);
  expect(lock.busy()).toBe(false);
});

test('a call that throws at once still frees the lock', async () => {
  const lock = new HeavyLock();
  await expect(lock.run(() => { throw new Error('x'); })).rejects.toThrow('x');
  expect(lock.busy()).toBe(false);
  expect(await lock.run(async () => 1)).toBe(1);
});

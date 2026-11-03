import { describe, expect, it } from 'vitest';
import { RECORD_KINDS } from '../../src/shared/records';
import { readStats } from '../../src/shared/stats';
import { validBody } from '../../src/web/validate';

const mins = { bike: 30, strength: 0, run: 0, mobility: 5, other: 0 };
const valid = () => ({
  type: 'stats', atMs: 1000, goal: 'fitter',
  days: [
    { date: '2026-11-01', minutes: { ...mins }, hardness: 'easy', legs: false },
    { date: '2026-11-02', minutes: { ...mins }, hardness: null, legs: true },
  ],
  muscles: { quads: 'fresh' },
});

describe('readStats', () => {
  it('accepts a valid body', () => { expect(readStats(valid())?.days).toHaveLength(2); });
  it('rejects an unknown type', () => { expect(readStats({ ...valid(), type: 'x' })).toBeNull(); });
  it('rejects a negative minute', () => {
    const b = valid(); b.days[0].minutes.bike = -1; expect(readStats(b)).toBeNull();
  });
  it('rejects 71 days', () => {
    const b = valid();
    b.days = Array.from({ length: 71 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), minutes: { ...mins }, hardness: null, legs: false }));
    expect(readStats(b)).toBeNull();
  });
  it('rejects duplicate dates', () => { const b = valid(); b.days[1].date = b.days[0].date; expect(readStats(b)).toBeNull(); });
  it('rejects dates out of order', () => { const b = valid(); b.days.reverse(); expect(readStats(b)).toBeNull(); });
  it('rejects minutes missing run', () => {
    const b = valid(); delete (b.days[0].minutes as Partial<typeof mins>).run; expect(readStats(b)).toBeNull();
  });
  it('rejects a numeric muscle value', () => { expect(readStats({ ...valid(), muscles: { quads: 3 } })).toBeNull(); });
  it('rejects hardness brutal', () => { const b = valid() as any; b.days[0].hardness = 'brutal'; expect(readStats(b)).toBeNull(); });
});

describe('stats kind', () => {
  it('is listed', () => { expect(RECORD_KINDS).toContain('stats'); });
  it('validates bodies', () => {
    expect(validBody('stats', valid())).toBe(true);
    expect(validBody('stats', {})).toBe(false);
  });
});

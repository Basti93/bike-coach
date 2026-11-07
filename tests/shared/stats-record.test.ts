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

describe('readStats rebuilds the body', () => {
  it('drops unknown top-level fields and rebuilds the muscles as a plain object of own keys', () => {
    const muscles = Object.assign(Object.create({ inherited: 'chest' }) as Record<string, string>, { t1: 'back' });
    const r = readStats({ ...valid(), extra: 'x', muscles })!;
    expect(r).not.toHaveProperty('extra');
    expect(r.muscles).toEqual({ t1: 'back' });
    expect(r.muscles).not.toBe(muscles);
    expect(Object.getPrototypeOf(r.muscles)).toBe(Object.prototype);
    expect('inherited' in r.muscles).toBe(false);
  });
  it('keeps a __proto__ key as an own key, not as the prototype', () => {
    const r = readStats(JSON.parse(JSON.stringify({ ...valid(), muscles: {} }).replace('"muscles":{}', '"muscles":{"__proto__":"chest"}')))!;
    expect(Object.getPrototypeOf(r.muscles)).toBe(Object.prototype);
    expect(Object.hasOwn(r.muscles, '__proto__')).toBe(true);
  });
});

describe('stats kind', () => {
  it('is listed', () => { expect(RECORD_KINDS).toContain('stats'); });
  it('validates bodies', () => {
    expect(validBody('stats', valid())).toBe(true);
    expect(validBody('stats', {})).toBe(false);
  });
});

describe('published advice', () => {
  const advice = { date: '2026-11-07', mode: 'week', sport: 'gym', hardness: 'hard', legs: false, label: 'Kraft ohne Beine', reason: 'weil deine Beine gestern hart gearbeitet haben', line: 'Kraft ohne Beine – weil deine Beine gestern hart gearbeitet haben', fromPlan: false };
  it('is read when whole, validated, and dropped alone when broken', () => {
    expect(readStats({ ...valid(), advice })?.advice).toEqual(advice);
    expect(validBody('stats', { ...valid(), advice })).toBe(true);
    const broken = readStats({ ...valid(), advice: { ...advice, sport: 'swim' } });
    expect(broken).not.toBeNull();
    expect(broken?.advice).toBeUndefined();
    expect(readStats(valid())?.advice).toBeUndefined();
  });
});

describe('published next steps', () => {
  const step = { exerciseId: 'cp', title: 'Bankdrücken', weightKg: 62.5, reps: 8, why: 'progress', reason: 'weil du alle Wiederholungen geschafft hast', forWorkoutId: 'w7', atMs: 1000 };
  it('round-trips, drops a broken entry and never the record', () => {
    expect(readStats({ ...valid(), next: [step, { ...step, exerciseId: 'x', weightKg: null }] })?.next).toHaveLength(2);
    const r = readStats({ ...valid(), next: [step, { ...step, why: 'jump' }, 'junk'] });
    expect(r?.next).toEqual([step]);
    expect(validBody('stats', { ...valid(), next: 'junk' })).toBe(true);
    expect(readStats({ ...valid(), next: 'junk' })?.next).toBeUndefined();
    expect(readStats(valid())?.next).toBeUndefined();
  });
});

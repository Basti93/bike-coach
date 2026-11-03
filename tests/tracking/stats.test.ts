import { describe, expect, it } from 'vitest';
import type { StatsBody, StatsDay, Sport } from '../../src/shared/stats';
import type { LoggedWorkout } from '../../src/shared/records';
import { statsView } from '../../src/tracking/stats';

// Local time on purpose: a week is Monday to Sunday where the person lives.
const NOW = new Date(2026, 10, 4, 12).getTime(); // Wednesday 4 Nov 2026; the current week starts Monday 2 Nov
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h).getTime();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const zero = (): Record<Sport, number> => ({ bike: 0, strength: 0, run: 0, mobility: 0, other: 0 });
const day = (date: string, minutes: Partial<Record<Sport, number>> = {}, hardness: StatsDay['hardness'] = null): StatsDay => ({ date, minutes: { ...zero(), ...minutes }, hardness, legs: false });
/** A day `weeksAgo` weeks before the current week, on Monday + offset. */
const dayIn = (weeksAgo: number, offset: number, minutes: Partial<Record<Sport, number>>, hardness: StatsDay['hardness'] = null) =>
  day(iso(new Date(2026, 10, 2 - 7 * weeksAgo + offset)), minutes, hardness);
const stats = (days: StatsDay[], extra: Partial<StatsBody> = {}): StatsBody => ({ type: 'stats', atMs: NOW, goal: null, days, muscles: {}, ...extra });

const set = (type: 'normal' | 'warmup' = 'normal', done = true) => ({ type, weightKg: 50, reps: 8, durationS: null, doneMs: done ? 1 : null });
const workout = (id: string, startMs: number, exerciseId: string, title: string, sets: ReturnType<typeof set>[], over: Partial<LoggedWorkout> = {}): LoggedWorkout => ({
  id, title: 'Training', startMs, endMs: startMs + 3_600_000, source: 'pandafit',
  exercises: [{ exerciseId, title, supersetId: null, notes: '', sets }], ...over,
});
const sevenWeeksOfBike = () => [1, 2, 3, 4, 5, 6, 7, 8].map((w) => dayIn(w, 1, { bike: 60 }));

describe('statsView weeks', () => {
  it('gives nine weeks, oldest first, the current week last, from the stats days', () => {
    const v = statsView(stats([dayIn(0, 0, { bike: 30, run: 20 }, 'hard'), dayIn(1, 3, { strength: 45 })]), [], NOW);
    expect(v.weeks).toHaveLength(9);
    expect(v.thisWeek).toBe(v.weeks[8]);
    expect(v.thisWeek.weekStart).toBe('2026-11-02');
    expect(v.weeks[7].weekStart).toBe('2026-10-26');
    expect(v.thisWeek.minutes).toMatchObject({ bike: 30, run: 20 });
    expect(v.thisWeek.hardDays).toBe(1);
    expect(v.weeks[7].minutes.strength).toBe(45);
    expect(v.sports).toEqual(['bike', 'strength', 'run']);
  });

  it('is all zero without a stats record', () => {
    const v = statsView(null, [], NOW);
    expect(v.weeks.every((w) => Object.values(w.minutes).every((m) => m === 0) && w.hardDays === 0)).toBe(true);
    expect(v.asOfMs).toBeNull();
    expect(v.verdicts).toEqual([]);
    expect(v.sports).toEqual([]);
  });

  it('takes the targets from the goal', () => {
    expect(statsView(stats([], { goal: 'muscle' }), [], NOW).targets.chest).toEqual({ min: 12, max: 18 });
    expect(statsView(null, [], NOW).targets.chest).toEqual({ min: 6, max: 8 });
  });
});

describe('statsView sets', () => {
  const thisMon = at(2026, 10, 2);
  it('counts working sets only, in finished workouts', () => {
    const w = [
      workout('a', thisMon, 'pf-bench-press', 'Bankdrücken', [set('warmup'), set(), set(), set('normal', false)]),
      workout('open', thisMon + 7_200_000, 'pf-bench-press', 'Bankdrücken', [set(), set()], { endMs: null }),
    ];
    expect(statsView(null, w, NOW).thisWeek.sets.chest).toBe(2);
  });

  it('counts a session known twice (own and Hevy copy) once', () => {
    const w = [
      workout('own', thisMon, 'pf-bench-press', 'Bankdrücken', [set(), set()]),
      workout('hv', thisMon + 60_000, 'hevy-t1', 'Bench Press (Barbell)', [set(), set()], { source: 'hevy' }),
    ];
    expect(statsView(null, w, NOW).thisWeek.sets.chest).toBe(2);
  });

  it('counts a kept copy and its record once', () => {
    const w = [
      workout('r', thisMon, 'pf-bench-press', 'Bankdrücken', [set(), set()]),
      workout('r-copy', thisMon + 8 * 3_600_000, 'pf-bench-press', 'Bankdrücken', [set(), set(), set()], { keptCopyOf: 'r' }),
    ];
    expect(statsView(null, w, NOW).thisWeek.sets.chest).toBe(3);
  });

  it('uses the muscle of the stats record for a Hevy exercise, else Sonstiges with the title', () => {
    const w = [
      workout('h1', thisMon, 'hevy-chest', 'Odd Press', [set(), set()], { source: 'hevy' }),
      workout('h2', thisMon + 86_400_000, 'hevy-unknown', 'Odd Machine', [set()], { source: 'hevy' }),
      workout('h3', thisMon + 2 * 86_400_000, 'hevy-unknown', 'Odd Machine', [set()], { source: 'hevy' }),
    ];
    const v = statsView(stats([], { muscles: { 'hevy-chest': 'chest' } }), w, NOW);
    expect(v.thisWeek.sets.chest).toBe(2);
    expect(v.thisWeek.sets.other).toBe(2);
    expect(v.unknown).toEqual(['Odd Machine']);
  });

  it('puts sets into the week they were done in', () => {
    const w = [workout('old', at(2026, 9, 28), 'pf-bench-press', 'Bankdrücken', [set()])];
    const v = statsView(null, w, NOW);
    expect(v.weeks[7].sets.chest).toBe(1);
    expect(v.thisWeek.sets.chest).toBeUndefined();
  });
});

describe('statsView verdicts', () => {
  it('says a short pair side, over the last four complete weeks only', () => {
    const w = [
      workout('c', at(2026, 9, 26), 'pf-bench-press', 'Bankdrücken', Array.from({ length: 14 }, () => set())),
      workout('b', at(2026, 9, 27), 'pf-row-machine', 'Rudermaschine', Array.from({ length: 8 }, () => set())),
      workout('now', at(2026, 10, 3), 'pf-bench-press', 'Bankdrücken', Array.from({ length: 30 }, () => set())),
    ];
    const v = statsView(null, w, NOW);
    expect(v.pairs[0]).toMatchObject({ a: 14, b: 8, short: 'back' });
    expect(v.verdicts.filter((s) => s.includes('kommt zu kurz'))).toEqual(['Rücken 8 Sätze, Brust 14: Rücken kommt zu kurz.']);
  });

  it('warns about more than two hard days in a week, also in the current week', () => {
    const hard = (w: number) => [0, 1, 2].map((o) => dayIn(w, o, { bike: 30 }, 'hard'));
    const v = statsView(stats([...hard(1), ...hard(0), dayIn(2, 0, {}, 'hard'), dayIn(2, 1, {}, 'hard')]), [], NOW);
    expect(v.verdicts).toContain('3 harte Tage in der Woche vom 26.10. Mehr als zwei sind viel.');
    expect(v.verdicts).toContain('3 harte Tage in der Woche vom 02.11. Mehr als zwei sind viel.');
    expect(v.verdicts.filter((s) => s.includes('harte Tage'))).toHaveLength(2);
  });

  it('says a set up sport is gone after three complete weeks', () => {
    const days = [...sevenWeeksOfBike().filter((d) => d.date < iso(new Date(2026, 9, 12))), dayIn(8, 0, { run: 40 }), ...[1, 2, 3, 4, 5, 6, 7].map((w) => dayIn(w, 2, { strength: 30 }))].sort((a, b) => a.date.localeCompare(b.date));
    const v = statsView(stats(days), [], NOW);
    expect(v.verdicts).toContain('Seit drei Wochen kein Rad.');
    expect(v.verdicts).toContain('Seit drei Wochen kein Laufen.');
    expect(v.verdicts.some((s) => s.includes('Krafttraining'))).toBe(false);
    expect(v.verdicts.some((s) => s.includes('Mobility') || s.includes('other'))).toBe(false);
  });

  it('says nothing about a sport that was never set up', () => {
    expect(statsView(stats([dayIn(0, 0, { bike: 20 })]), [], NOW).verdicts).toEqual([]);
  });

  it('says a week had clearly more minutes than the four before', () => {
    const days = [5, 4, 3, 2].map((w) => dayIn(w, 0, { bike: 60 }));
    days.push(dayIn(1, 0, { bike: 200 }));
    const v = statsView(stats(days.sort((a, b) => a.date.localeCompare(b.date))), [], NOW);
    expect(v.verdicts.filter((s) => s.includes('deutlich mehr'))).toEqual(['Die Woche vom 26.10. hatte deutlich mehr Minuten als die vier davor.']);
  });

  it('says nothing about a steady load', () => {
    const v = statsView(stats([8, 7, 6, 5, 4, 3, 2, 1].map((w) => dayIn(w, 0, { bike: 60 }))), [], NOW);
    expect(v.verdicts.some((s) => s.includes('deutlich mehr'))).toBe(false);
  });
});

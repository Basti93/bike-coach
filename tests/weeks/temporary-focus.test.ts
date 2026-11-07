import { addDays } from '../../src/shared/week-plan';
import { goalOf, goalRecord, readGoal, readRule, ruleRecord } from '../../src/shared/personal';
import { MUSCLE_TARGETS, weeklySetRange } from '../../src/shared/muscle-targets';
import { muscleBalance } from '../../src/shared/muscle-balance';
import { ruleNumber } from '../../src/shared/training-policy';
import { validBody as validateRecord } from '../../src/web/validate';

const TODAY = '2026-11-07';
const base = { strength: 'muscle' as const, focus: ['chest' as const], sports: { bike: 'keep' as const } };
const temp = (until: string, extra: object = {}) => goalRecord({ ...base, temporary: { focus: ['back'], until, ...extra } }, 5);

describe('temporary focus', () => {
  it('overlays while active (until included) and returns the base afterwards', () => {
    expect(goalOf([temp('2026-11-20')], TODAY).focus).toEqual(['back']);
    expect(goalOf([temp(TODAY)], TODAY).focus).toEqual(['back']);
    const after = goalOf([temp('2026-11-06')], TODAY);
    expect(after.focus).toEqual(['chest']);
    expect(after.sports).toEqual({ bike: 'keep' });
  });

  it('overlays sports per key, the rest stays', () => {
    const r = goalRecord({ ...base, temporary: { sports: { run: 'focus' }, until: '2026-12-01' } }, 5);
    expect(goalOf([r], TODAY).sports).toEqual({ bike: 'keep', run: 'focus' });
  });

  it('shows what ended for 14 days, until seen', () => {
    const ended = (today: string, rec = temp('2026-11-01')) => goalOf([rec], today).ended;
    expect(ended('2026-11-02')).toEqual({ until: '2026-11-01', focus: ['back'], sports: {} });
    expect(ended(addDays('2026-11-01', 14))).toBeDefined();
    expect(ended(addDays('2026-11-01', 15))).toBeUndefined();
    expect(ended('2026-11-02', temp('2026-11-01', { endedSeenMs: 9 }))).toBeUndefined();
    expect(goalOf([temp('2026-11-20')], TODAY).ended).toBeUndefined();
    expect(ruleNumber('focus.ended-notice-days')).toBe(14);
  });

  it('old records without temporary parse unchanged', () => {
    expect(goalOf([goalRecord(base, 5)], TODAY)).toEqual(base);
    expect(readGoal({ ...base, atMs: 1 })).toEqual({ ...base, atMs: 1 });
    expect(readGoal({ ...base, atMs: 1, temporary: { focus: ['back'], until: 'tomorrow' } })).toBeNull();
    expect(readGoal({ ...base, atMs: 1, temporary: { until: '2026-11-20' } })).toBeNull();
    expect(validateRecord('goal', { ...base, atMs: 1, temporary: { focus: ['back'], until: '2026-11-20' } })).toBe(true);
    expect(validateRecord('goal', { ...base, atMs: 1, temporary: { focus: ['x'], until: '2026-11-20' } })).toBe(false);
  });

  it('a goal rule may carry weeks 1 to 12', () => {
    const rule = (weeks: unknown) => readRule('r', ruleRecord('r', { kind: 'goal', text: 't', sport: 'all', goal: { focus: ['back'], weeks } as never }, 'proposed', 'chat', 1).body);
    expect(rule(4)?.goal).toEqual({ focus: ['back'], weeks: 4 });
    expect(rule(13)).toBeNull();
    expect(rule(0)).toBeNull();
    expect(rule(1.5)).toBeNull();
  });
});

describe('focus factor', () => {
  it('raises the range for focus groups only', () => {
    expect(ruleNumber('muscle.focus-factor')).toBe(1.3);
    const plain = weeklySetRange('chest', 'muscle');
    expect(weeklySetRange('chest', 'muscle', ['chest'])).toEqual({ min: Math.round(plain.min * 1.3), max: Math.round(plain.max * 1.3) });
    expect(weeklySetRange('back', 'muscle', ['chest'])).toEqual(MUSCLE_TARGETS.back.muscle);
    expect(weeklySetRange('other', 'muscle', ['chest'])).toEqual({ min: 0, max: 0 });
  });

  it('moves the balance state', () => {
    const items = [{ exercise: { primaryMuscle: 'chest' }, sets: 12, ageMs: 0 }];
    const state = (focus: string[]) => muscleBalance(items, 'muscle', focus as never).find((g) => g.group === 'chest')!;
    expect(state([]).state).toBe('good');
    expect(state(['chest']).state).toBe('low');
    expect(state(['chest']).target.min).toBe(16);
  });
});

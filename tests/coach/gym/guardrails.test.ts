import { describe, expect, it } from 'vitest';
import type { StrengthWorkout, SetType } from '../../../src/coach/hevy';
import type { ExerciseTemplate } from '../../../src/coach/gym/types';
import { checkWorkout, type GymContext } from '../../../src/coach/gym/guardrails';
import { ruleWorkout } from '../../../src/coach/gym/rules';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 2, 12);
const T = (id: string, equipment: string, primaryMuscle: string, type = 'weight_reps'): ExerciseTemplate => ({ id, title: `Title ${id}`, type, primaryMuscle, equipment });
const TEMPLATES: ExerciseTemplate[] = [
  T('sq', 'barbell', 'quadriceps'), T('bp', 'barbell', 'chest'), T('cp', 'machine', 'chest'), T('lp', 'machine', 'quadriceps'),
  T('lr', 'machine', 'lats'), T('cu', 'machine', 'biceps'), T('sp', 'machine', 'shoulders'), T('hc', 'machine', 'hamstrings'),
  T('kb', 'kettlebell', 'glutes'), T('pu', 'none', 'lats', 'bodyweight_reps'), T('db', 'dumbbell', 'triceps'),
];
type S = [number | null, number, SetType?];
const wk = (daysAgo: number, id: string, sets: S[]): StrengthWorkout => ({
  id: `w${daysAgo}${id}`, title: 'Day', startMs: NOW - daysAgo * DAY, durationS: 3600,
  exercises: [{ title: id, templateId: id, sets: sets.length, reps: 0, volumeKg: 0, workSets: sets.map(([weightKg, reps, type]) => ({ type: type ?? 'normal', weightKg, reps })) }],
});
const two = (id: string, kg: number | null, reps = 8): StrengthWorkout[] => [wk(14, id, [[kg, reps], [kg, reps]]), wk(7, id, [[kg, reps], [kg, reps]])];
// suggestNext: sq 60 kg reps 8 keep? 8 reps both sessions -> progress 9 reps at 60. cp 40 kg, bp 80 kg, pu bodyweight.
const CTX: GymContext = { workouts: [...two('sq', 60), ...two('bp', 80), ...two('cp', 40), ...two('pu', null, 12)], templates: TEMPLATES, nowMs: NOW };

const set = (weightKg: number | null, reps: number | null, type = 'normal') => ({ type, weightKg, reps });
const ex = (templateId: unknown, sets: unknown[], extra: Record<string, unknown> = {}) => ({ templateId, title: 'x', restS: 90, supersetId: null, notes: '', sets, ...extra });
const wo = (exercises: unknown) => ({ name: 'Test', exercises });
const refused = (raw: unknown, ctx = CTX) => { const r = checkWorkout(raw, ctx); expect(r.ok).toBe(false); return r.ok ? '' : r.reason; };
const passes = (raw: unknown, ctx = CTX) => { const r = checkWorkout(raw, ctx); if (!r.ok) throw new Error(r.reason); return r.workout; };

describe('checkWorkout', () => {
  it('an unknown template id is refused', () => {
    refused(wo([ex('nope', [set(null, 8)])]));
    refused(wo([ex(42, [set(null, 8)])]));
  });
  it('more than 10 exercises or 30 sets are refused', () => {
    const ten = ['cp', 'lp', 'lr', 'cu', 'sp', 'hc', 'cp', 'lp', 'lr', 'cu'].map((id) => ex(id, [set(null, 8)]));
    passes(wo(ten));
    refused(wo([...ten, ex('sp', [set(null, 8)])]));
    passes(wo([ex('cp', Array.from({ length: 30 }, () => set(40, 8)))]));
    refused(wo([ex('cp', Array.from({ length: 31 }, () => set(40, 8)))]));
    refused(wo([ex('cp', Array.from({ length: 15 }, () => set(40, 8))), ex('lp', Array.from({ length: 16 }, () => set(null, 8)))]));
    refused(wo([]));
    refused(wo([ex('cp', [])]));
  });
  it('a weight above suggestNext plus the step is refused', () => {
    passes(wo([ex('cp', [set(40, 9)])]));
    passes(wo([ex('cp', [set(42.5, 8)])]));
    refused(wo([ex('cp', [set(42.6, 8)])]));
    passes(wo([ex('bp', [set(84, 8)])]));
    refused(wo([ex('bp', [set(84.5, 8)])]));
  });
  it('a weight without history is refused', () => {
    refused(wo([ex('lp', [set(30, 8)])]));
    refused(wo([ex('pu', [set(10, 8)])]));
    passes(wo([ex('lp', [set(null, 8)])]));
  });
  it("a template from Hevy's list with recent equipment passes without a weight", () => {
    expect(passes(wo([ex('lp', [set(null, 8)])])).exercises[0].title).toBe('Title lp');
  });
  it('equipment never seen in recent months is refused', () => {
    refused(wo([ex('kb', [set(null, 8)])]));
    // machine equipment was only seen long ago: not available any more
    const onlyOld: GymContext = { ...CTX, workouts: [wk(200, 'cp', [[40, 8], [40, 8]]), ...CTX.workouts.filter((w) => !w.id.includes('cp'))] };
    refused(wo([ex('lp', [set(null, 8)])]), onlyOld);
  });
  it('failure on barbell is refused', () => {
    refused(wo([ex('bp', [set(80, 8), set(80, 8, 'failure')])]));
  });
  it('failure on machine or cable passes, at most 4 per workout', () => {
    passes(wo([ex('cp', [set(40, 8), set(40, 8, 'failure')])]));
    passes(wo([ex('cp', [set(40, 8, 'failure'), set(40, 8, 'failure')]), ex('lp', [set(null, 8, 'failure'), set(null, 8, 'failure')])]));
    refused(wo([ex('cp', Array.from({ length: 5 }, () => set(40, 8, 'failure')))]));
  });
  it('a widowmaker note on barbell is refused, and a second widowmaker too', () => {
    refused(wo([ex('bp', [set(60, 20)], { notes: 'Widowmaker: 20 Wiederholungen' })]));
    const w = { notes: 'Widowmaker: 20 Wiederholungen' };
    passes(wo([ex('cp', [set(40, 20)], w)]));
    refused(wo([ex('cp', [set(40, 20)], w), ex('lp', [set(null, 20)], w)]));
  });
  it('a widowmaker without a 20 rep set, or with two, is refused', () => {
    refused(wo([ex('cp', [set(40, 8)], { notes: 'Widowmaker: x' })]));
    refused(wo([ex('cp', [set(40, 20), set(40, 20)], { notes: 'Widowmaker: x' })]));
  });
  it('superset ids must pair at least two exercises', () => {
    refused(wo([ex('cp', [set(40, 8)], { supersetId: 1 }), ex('lp', [set(null, 8)])]));
    passes(wo([ex('cp', [set(40, 8)], { supersetId: 1 }), ex('lp', [set(null, 8)], { supersetId: 1 })]));
    refused(wo([ex('cp', [set(40, 8)], { supersetId: 1.5 }), ex('lp', [set(null, 8)], { supersetId: 1.5 })]));
    refused(wo([ex('cp', [set(40, 8)], { supersetId: '1' })]));
  });
  it('reps outside 6 to 12 on normal sets are refused except on a widowmaker with 20 reps', () => {
    refused(wo([ex('cp', [set(40, 5)])]));
    refused(wo([ex('cp', [set(40, 13)])]));
    refused(wo([ex('cp', [set(40, 20)])]));
    refused(wo([ex('cp', [set(40, 5, 'failure')])]));
    passes(wo([ex('cp', [set(40, 6), set(40, 12)])]));
    refused(wo([ex('cp', [set(40, 21)], { notes: 'Widowmaker: x' })]));
  });
  it('bodyweight reps may exceed 12 but stay positive whole numbers', () => {
    passes(wo([ex('pu', [set(null, 15)])]));
    passes(wo([ex('pu', [set(null, 1)])]));
    refused(wo([ex('pu', [set(null, 0)])]));
    refused(wo([ex('pu', [set(null, 500)])]));
  });
  it('a widowmaker is 20 reps at no more than the suggested weight', () => {
    const w = { notes: 'Widowmaker: 20 Wiederholungen' };
    passes(wo([ex('cp', [set(40, 20)], w)]));
    refused(wo([ex('cp', [set(42.5, 20)], w)]));
    refused(wo([ex('lp', [set(null, 20)], w)])); // no history: no widowmaker
  });
  it('malformed values are refused', () => {
    for (const bad of [null, undefined, 'x', 7, [], {}, { name: 'a' }, { name: '', exercises: [ex('cp', [set(40, 8)])] }, { name: 5, exercises: [] }, wo('x'), wo([null]), wo([ex('cp', 'x' as unknown as unknown[])]), wo([ex('cp', [null])])]) refused(bad);
    for (const w of [Number.NaN, Infinity, -5, 0, '40', 40.123]) refused(wo([ex('cp', [set(w as number, 8)])]));
    for (const r of [Number.NaN, Infinity, -1, 8.5, '8', undefined]) refused(wo([ex('cp', [set(40, r as number)])]));
    refused(wo([ex('cp', [set(40, 8, 'superset')])]));
    refused(wo([ex('cp', [set(40, 8)], { restS: -1 })]));
    refused(wo([ex('cp', [set(40, 8)], { restS: 99999 })]));
    refused(wo([ex('cp', [set(40, 8)], { restS: Number.NaN })]));
    refused(wo([ex('cp', [set(40, 8)], { notes: 5 })]));
    refused(wo([ex('cp', [{ ...set(40, null), repRange: { start: 5, end: 10 } }])]));
    refused(wo([ex('cp', [{ ...set(40, null), repRange: { start: 10, end: 8 } }])]));
    passes(wo([ex('cp', [{ ...set(40, null), repRange: { start: 8, end: 12 } }])]));
  });
  it('reps are checked together with a rep range', () => {
    refused(wo([ex('cp', [{ ...set(40, 100), repRange: { start: 8, end: 10 } }])]));
    refused(wo([ex('cp', [{ ...set(40, 20), repRange: { start: 8, end: 10 } }])]));
    refused(wo([ex('cp', [{ ...set(40, 20), repRange: { start: 8, end: 10 } }], { notes: 'Widowmaker: x' })]));
    refused(wo([ex('cp', [{ ...set(40, null), repRange: { start: 4, end: 10 } }])]));
    refused(wo([ex('cp', [{ ...set(40, null), repRange: { start: 8, end: 15 } }])]));
    passes(wo([ex('cp', [{ ...set(40, 9), repRange: { start: 8, end: 10 } }])]));
  });
  it('a widowmaker note is recognised with a leading space or other case', () => {
    expect(refused(wo([ex('bp', [set(60, 8)], { notes: '  widowmaker: 20' })]))).toMatch(/Widowmaker/);
    expect(refused(wo([ex('bp', [set(60, 8)], { notes: 'WIDOWMAKER' })]))).toMatch(/Widowmaker/);
    const a = ex('cp', [set(40, 20)], { notes: ' widowmaker: x' });
    const b = ex('lp', [set(null, 20)], { notes: 'WIDOWMAKER: x' });
    expect(refused(wo([a, b]))).toMatch(/mehr als 1 Widowmaker/);
  });
  it('the result carries only known fields, with the title from the template', () => {
    const w = passes({ name: 'Test', extra: 1, exercises: [{ ...ex('cp', [set(40, 8)]), evil: 'x' }] });
    expect(w).toEqual({ name: 'Test', exercises: [{ templateId: 'cp', title: 'Title cp', restS: 90, supersetId: null, notes: '', sets: [{ type: 'normal', weightKg: 40, reps: 8 }] }] });
  });
});

describe('ruleWorkout', () => {
  const many = (): StrengthWorkout[] => [
    ...two('cp', 40), ...two('lr', 30), ...two('sp', 20), ...two('cu', 15), ...two('hc', 25), ...two('lp', 100), wk(3, 'db', [[10, 8]]),
  ];
  it('has a recurring core of up to 6 most frequent recent exercises, passes its own check, and has no weights where history is missing', () => {
    const ctx: GymContext = { workouts: [...many(), wk(2, 'cp', [[40, 8]]), wk(1, 'cp', [[40, 8]])].map((w) => ({ ...w, startMs: w.startMs - 5 * DAY })), templates: TEMPLATES, nowMs: NOW };
    const r = ruleWorkout(ctx);
    expect(r.workout.exercises.length).toBe(6);
    expect(r.workout.exercises[0].templateId).toBe('cp'); // most frequent
    expect(r.workout.exercises.map((e) => e.templateId)).not.toContain('db');
    expect(r.reason.length).toBeGreaterThan(0);
    const c = checkWorkout(r.workout, ctx);
    expect(c.ok).toBe(true);
    const noKg: GymContext = { ...ctx, workouts: ctx.workouts.map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, workSets: e.workSets.map((s) => ({ ...s, weightKg: null })) })) })) };
    expect(ruleWorkout(noKg).workout.exercises.flatMap((e) => e.sets).every((s) => s.weightKg === null)).toBe(true);
  });
  it('ignores exercises that are not recent or not in the template list', () => {
    const ctx: GymContext = { workouts: [wk(300, 'cp', [[40, 8]]), wk(10, 'ghost', [[40, 8]]), wk(10, 'lr', [[30, 8]])], templates: TEMPLATES, nowMs: NOW };
    expect(ruleWorkout(ctx).workout.exercises.map((e) => e.templateId)).toEqual(['lr']);
  });
  it('with empty history the rule workout is a simple machine full-body workout without weights', () => {
    const r = ruleWorkout({ workouts: [], templates: TEMPLATES, nowMs: NOW });
    const list = r.workout.exercises;
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.length).toBeLessThanOrEqual(6);
    expect(list.every((e) => TEMPLATES.find((t) => t.id === e.templateId)?.equipment === 'machine')).toBe(true);
    expect(list.flatMap((e) => e.sets).every((s) => s.weightKg === null && s.type === 'normal' && s.reps! >= 6 && s.reps! <= 12)).toBe(true);
    expect(r.reason).toMatch(/Noch keine früheren Trainings/);
  });
  it('says honestly when no suitable exercises were found', () => {
    for (const templates of [[], TEMPLATES.filter((t) => t.equipment !== 'machine')]) {
      const r = ruleWorkout({ workouts: [], templates, nowMs: NOW });
      expect(r.workout.exercises).toEqual([]);
      expect(r.reason).toMatch(/keine passenden Übungen/);
      expect(r.reason).not.toMatch(/Ganzkörpertraining/);
    }
  });
  it('recent leg work leaves out heavy leg exercises', () => {
    const legs = [wk(1, 'lp', [[100, 8]]), ...many().filter((w) => !w.id.endsWith('lp'))];
    const ctx: GymContext = { workouts: legs, templates: TEMPLATES, nowMs: NOW };
    const ids = ruleWorkout(ctx).workout.exercises.map((e) => e.templateId);
    expect(ids).not.toContain('lp');
    expect(ids).not.toContain('hc');
    expect(ids.length).toBeGreaterThan(0);
  });
});

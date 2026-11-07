import { describe, expect, it } from 'vitest';
import { familyFromName } from '../../scripts/fedb-families';
import { ChatCoach } from '../../src/coach/chat/chat-coach';
import { excludedOf } from '../../src/coach/tracking/personal';
import { mergeCatalog } from '../../src/shared/catalog';
import { EXERCISES } from '../../src/shared/exercises';
import { FAMILIES, familyOf, isFamily } from '../../src/shared/families';
import { FEDB_EXERCISES } from '../../src/shared/fedb';
import { excludedIds, readRule, ruleRecord } from '../../src/shared/personal';
import type { TrackedRecord } from '../../src/shared/records';
import { similarExercises } from '../../src/tracking/similar';
import { isExcludedExercise } from '../../src/tracking/session';

const NOW = Date.UTC(2026, 10, 7, 12);
const rule = (families: string[], extra: object = {}): TrackedRecord => ruleRecord('rule-f', { kind: 'exclude', text: 'ohne', sport: 'gym', families, ...extra }, 'active', 'person', NOW);
const aiExercise = (id: string, title: string, family?: string): TrackedRecord =>
  ({ kind: 'exercise', id, updatedMs: NOW, deleted: false, body: { id, title, type: 'weight_reps', primaryMuscle: 'quadriceps', equipment: 'barbell', source: 'ai', ...(family ? { family } : {}) } });

describe('families', () => {
  it('every stored family is a known one, and the built-in squats share theirs', () => {
    for (const e of [...EXERCISES, ...FEDB_EXERCISES]) if (e.family !== undefined) expect(isFamily(e.family)).toBe(true);
    for (const id of ['pf-squat', 'pf-front-squat', 'pf-goblet-squat', 'pf-hack-squat', 'pf-squat-bw']) expect(familyOf(EXERCISES.find((e) => e.id === id)!)).toBe('squat');
    expect(familyOf({})).toBe('other');
    expect(familyOf({ family: 'nonsense' })).toBe('other');
    expect(FAMILIES.some((f) => f.id === 'other')).toBe(true);
  });

  it('the importer table maps names to families', () => {
    const cases: Record<string, string> = {
      'Barbell Full Squat': 'squat', 'Front Squat (Clean Grip)': 'squat', 'Romanian Deadlift from Deficit': 'hinge', 'Barbell Walking Lunge': 'lunge',
      'Smith Single-Leg Split Squat': 'lunge', 'Butt Lift (Bridge)': 'hip-thrust', 'Smith Machine Bench Press': 'bench-press', 'Incline Dumbbell Flyes': 'fly',
      'Incline Cable Chest Press': 'incline-press', 'Parallel Bar Dip': 'dip', 'Decline Push-Up': 'push-up', 'Standing Military Press': 'overhead-press',
      'Cable Seated Lateral Raise': 'lateral-raise', 'Cable Rear Delt Fly': 'rear-delt', 'Lying T-Bar Row': 'row', 'V-Bar Pulldown': 'pulldown',
      'Band Assisted Pull-Up': 'pull-up', 'Zottman Curl': 'curl', 'Drag Curl': 'curl', 'EZ-Bar Skullcrusher': 'triceps', 'Barbell Shrug': 'shrug',
      'Cable Russian Twists': 'core', "Farmer's Walk": 'carry', 'Standing Leg Curl': 'leg-curl', 'Single-Leg Leg Extension': 'leg-extension',
      'Smith Machine Leg Press': 'leg-press', 'Donkey Calf Raises': 'calf',
      // on purpose not a family
      'Power Clean': 'other', 'Squat Jerk': 'other', 'Seated Palms-Down Barbell Wrist Curl': 'other', 'Box Jump (Multiple Response)': 'other', 'Kettlebell Thruster': 'other',
    };
    for (const [name, family] of Object.entries(cases)) expect([name, familyFromName(name)]).toEqual([name, family]);
  });

  it('the base list carries the families the table gives', () => {
    const byId = new Map(FEDB_EXERCISES.map((e) => [e.id, e]));
    expect(byId.get('fedb-barbell-full-squat')?.family).toBe('squat');
    expect(byId.get('fedb-clean')?.family).toBeUndefined();
    expect(FEDB_EXERCISES.filter((e) => e.family).length).toBeGreaterThan(400);
  });

  it('the catalog keeps a valid family of an exercise record and drops an unknown one', () => {
    const cat = mergeCatalog(EXERCISES, FEDB_EXERCISES, [aiExercise('ai-1', 'Eigene Kniebeuge', 'squat'), aiExercise('ai-2', 'Komisch', 'zzz')]);
    expect(cat.find((e) => e.id === 'ai-1')?.family).toBe('squat');
    expect(cat.find((e) => e.id === 'ai-2')?.family).toBeUndefined();
  });
});

describe('family exclusion', () => {
  it('a family rule excludes every variant, also one added later', () => {
    const records = [rule(['squat'])];
    const before = excludedIds(records, mergeCatalog(EXERCISES, FEDB_EXERCISES, []));
    expect(before.has('pf-squat')).toBe(true);
    expect(before.has('fedb-barbell-full-squat')).toBe(true);
    expect(before.has('pf-bench-press')).toBe(false);
    const later = mergeCatalog(EXERCISES, FEDB_EXERCISES, [aiExercise('ai-1', 'Eigene Kniebeuge', 'squat'), aiExercise('ai-3', 'Ohne Familie')]);
    const after = excludedIds(records, later);
    expect(after.has('ai-1')).toBe(true);
    expect(after.has('ai-3')).toBe(false);
    expect(isExcludedExercise({ templateId: 'ai-1', title: 'Eigene Kniebeuge' }, later, after)).toBe(true);
  });

  it('the family and the id lists add up, and a paused rule does nothing', () => {
    const cat = mergeCatalog(EXERCISES, FEDB_EXERCISES, []);
    const both = excludedIds([rule(['calf'], { exerciseIds: ['pf-plank'] })], cat);
    expect(both.has('pf-plank') && both.has('pf-calf-raise-seated')).toBe(true);
    const paused = ruleRecord('rule-p', { kind: 'exclude', text: 'ohne', sport: 'gym', families: ['calf'] }, 'paused', 'person', NOW);
    expect(excludedIds([paused], cat).size).toBe(0);
  });

  it('other can never be excluded as a family', () => {
    expect(readRule('x', rule(['other']).body)).toBeNull();
    expect(readRule('x', rule(['squat', 'other']).body)).toBeNull();
    expect(readRule('x', rule(['not-a-family']).body)).toBeNull();
    expect(readRule('x', rule([]).body)).toBeNull();
    expect(readRule('x', rule(['squat']).body)).toMatchObject({ families: ['squat'] });
    // an exclude rule with neither ids nor families is not a rule
    expect(readRule('x', ruleRecord('x', { kind: 'exclude', text: 'ohne', sport: 'gym' }, 'active', 'person', NOW).body)).toBeNull();
    // the resolver ignores it even if it somehow got in
    const cat = mergeCatalog(EXERCISES, FEDB_EXERCISES, []);
    const sneaky = { ...rule(['squat']), body: { ...(rule(['squat']).body as object), families: ['other'] } };
    expect(excludedIds([sneaky], cat).size).toBe(0);
  });

  it('a swap suggestion list holds the family of the exercise as the same movement', () => {
    const cat = mergeCatalog(EXERCISES, FEDB_EXERCISES, [aiExercise('ai-1', 'Eigene Kniebeuge', 'squat')]);
    const got = similarExercises({ title: 'Kniebeuge', exerciseId: 'pf-squat' }, cat).map((e) => e.id);
    expect(got).toContain('ai-1');
    expect(got).toContain('pf-hack-squat');
  });
});

describe('chat family draft', () => {
  const ANSWER = { text: 'Okay.', proposal: null, riderAskedForMore: false, newComplaint: null, complaintsOver: [], tasks: [], nextChange: null };
  const run = async (ruleDraft: unknown) => {
    const recs = new Map<string, TrackedRecord>([['chat:r1', { kind: 'chat', id: 'r1', updatedMs: 1, deleted: false, body: { role: 'rider', text: 'künftig keine Kniebeugen', atMs: NOW - 1000 } }]]);
    const store = { all: (_i: string, kind?: string) => [...recs.values()].filter((r) => !kind || r.kind === kind), put: (_i: string, r: TrackedRecord) => { recs.set(`${r.kind}:${r.id}`, r); return r; } };
    let prompts = 0;
    const coach = new ChatCoach({ store: store as never, nowMs: () => NOW, newId: () => 'm1', ask: (async () => { prompts++; return { ...ANSWER, ruleDraft }; }) as never });
    await coach.tick('p');
    return { recs, store, prompts };
  };

  it('becomes a proposed exclude rule with families, without a catalog retry', async () => {
    const { recs, prompts } = await run({ kind: 'exclude', text: 'Keine Kniebeugen mehr', sport: 'gym', families: ['squat', 'other', 'nope'] });
    expect(recs.get('rule:rule-m1')!.body).toMatchObject({ kind: 'exclude', state: 'proposed', families: ['squat'] });
    expect((recs.get('rule:rule-m1')!.body as { exerciseIds?: string[] }).exerciseIds).toBeUndefined();
    expect(prompts).toBe(1);
  });

  it('with only unusable families it stays a wish', async () => {
    const { recs } = await run({ kind: 'exclude', text: 'Keine Kniebeugen mehr', sport: 'gym', families: ['other'] });
    expect(recs.get('rule:rule-m1')!.body).toMatchObject({ kind: 'wish' });
  });

  it('once taken the family holds in the exclusion', async () => {
    const { recs, store } = await run({ kind: 'exclude', text: 'Keine Kniebeugen mehr', sport: 'gym', families: ['squat'] });
    const body = recs.get('rule:rule-m1')!.body as object;
    recs.set('rule:rule-m1', { ...recs.get('rule:rule-m1')!, body: { ...body, state: 'active' } });
    const out = excludedOf(store as never, 'p', EXERCISES);
    expect(out.has('pf-goblet-squat') && !out.has('pf-plank')).toBe(true);
  });
});

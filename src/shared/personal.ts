import type { TrackedRecord } from './records';
import type { MuscleGroup } from './muscle-targets';
import { titleHash, above } from './exercise-links';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** The muscle groups a person can put the focus on (everything the targets know except "other"). */
export const FOCUS_GROUPS: Exclude<MuscleGroup, 'other'>[] = ['chest', 'back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'traps', 'forearms'];
export const MAX_FOCUS = 3;
export const RULE_TEXT_MAX = 120;
export const MAX_EXCLUDED = 30;

export type Strength = 'muscle' | 'strength' | 'fitness';
export type Prio = 'focus' | 'equal' | 'keep';
export type SportKey = 'gym' | 'bike' | 'run';
export type GoalBody = { strength: Strength; focus: MuscleGroup[]; sports: Partial<Record<SportKey, Prio>>; atMs: number };
export const DEFAULT_GOAL: Omit<GoalBody, 'atMs'> = { strength: 'muscle', focus: [], sports: {} };

const STRENGTHS: Strength[] = ['muscle', 'strength', 'fitness'];
const PRIOS: Prio[] = ['focus', 'equal', 'keep'];
const SPORT_KEYS: SportKey[] = ['gym', 'bike', 'run'];

/** One goal per profile: record kind `goal`, id `goal`. */
export const GOAL_ID = 'goal';

function readGoalParts(b: Record<string, unknown>): Omit<GoalBody, 'atMs'> | null {
  if (!STRENGTHS.includes(b.strength as Strength)) return null;
  if (!Array.isArray(b.focus) || b.focus.length > MAX_FOCUS || !b.focus.every((g) => FOCUS_GROUPS.includes(g as never)) || new Set(b.focus).size !== b.focus.length) return null;
  if (!isObj(b.sports)) return null;
  const sports: Partial<Record<SportKey, Prio>> = {};
  for (const [k, v] of Object.entries(b.sports)) {
    if (!SPORT_KEYS.includes(k as SportKey) || !PRIOS.includes(v as Prio)) return null;
    sports[k as SportKey] = v as Prio;
  }
  return { strength: b.strength as Strength, focus: b.focus as MuscleGroup[], sports };
}

/** The body of a `goal` record, or null for anything else. */
export function readGoal(body: unknown): GoalBody | null {
  if (!isObj(body) || !num(body.atMs)) return null;
  const g = readGoalParts(body);
  return g ? { ...g, atMs: body.atMs } : null;
}

export const goalRecord = (g: Omit<GoalBody, 'atMs'>, nowMs: number, have?: TrackedRecord): TrackedRecord =>
  ({ kind: 'goal', id: GOAL_ID, updatedMs: above(nowMs, have), deleted: false, body: { ...g, atMs: nowMs } });

/** The profile's goal; without a record (or a readable one) today's behaviour: build muscle, no focus, no priorities. */
export function goalOf(records: readonly TrackedRecord[]): Omit<GoalBody, 'atMs'> {
  const r = records.find((x) => x.kind === 'goal' && x.id === GOAL_ID && !x.deleted);
  const g = r ? readGoal(r.body) : null;
  return g ? { strength: g.strength, focus: g.focus, sports: g.sports } : { ...DEFAULT_GOAL, focus: [], sports: {} };
}

export type RuleKind = 'exclude' | 'wish' | 'goal';
export type RuleSport = SportKey | 'all';
export type RuleState = 'proposed' | 'active' | 'paused' | 'declined';
export type RuleSource = 'chat' | 'person' | 'migrated';
export type Rule = { id: string; kind: RuleKind; text: string; sport: RuleSport; exerciseIds?: string[]; goal?: Partial<Omit<GoalBody, 'atMs'>>; state: RuleState; source: RuleSource; atMs: number };

const KINDS: RuleKind[] = ['exclude', 'wish', 'goal'];
const RULE_STATES: RuleState[] = ['proposed', 'active', 'paused', 'declined'];
const SOURCES: RuleSource[] = ['chat', 'person', 'migrated'];

export const ruleId = (id: string): string => `rule-${id}`;
/** Migrated rules: the same text for the same sport is the same record, so a rerun adds nothing. */
export const migratedRuleId = (sport: RuleSport, text: string): string => ruleId(`m-${sport}-${titleHash(`${sport}\n${text}`)}`);

/** The body of a `rule` record, or null for anything else. */
export function readRule(id: string, body: unknown): Rule | null {
  if (!isObj(body) || !KINDS.includes(body.kind as RuleKind) || !RULE_STATES.includes(body.state as RuleState) || !SOURCES.includes(body.source as RuleSource) || !num(body.atMs)) return null;
  if (typeof body.text !== 'string' || body.text.trim() === '' || body.text.length > RULE_TEXT_MAX) return null;
  if (body.sport !== 'all' && !SPORT_KEYS.includes(body.sport as SportKey)) return null;
  const kind = body.kind as RuleKind;
  let exerciseIds: string[] | undefined;
  if (kind === 'exclude') {
    const ids = body.exerciseIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_EXCLUDED || !ids.every((x) => typeof x === 'string' && x !== '')) return null;
    exerciseIds = ids as string[];
  }
  let goal: Rule['goal'];
  if (kind === 'goal') {
    if (!isObj(body.goal)) return null;
    const g = body.goal;
    goal = {};
    if (g.strength !== undefined) { if (!STRENGTHS.includes(g.strength as Strength)) return null; goal.strength = g.strength as Strength; }
    if (g.focus !== undefined || g.sports !== undefined) {
      const parts = readGoalParts({ strength: 'muscle', focus: g.focus ?? [], sports: g.sports ?? {} });
      if (!parts) return null;
      if (g.focus !== undefined) goal.focus = parts.focus;
      if (g.sports !== undefined) goal.sports = parts.sports;
    }
  }
  return { id, kind, text: body.text, sport: body.sport as RuleSport, ...(exerciseIds ? { exerciseIds } : {}), ...(goal ? { goal } : {}), state: body.state as RuleState, source: body.source as RuleSource, atMs: body.atMs };
}

export type RuleDraft = { kind: RuleKind; text: string; sport: RuleSport; exerciseIds?: string[]; goal?: Rule['goal'] };

/** Migrated records are stamped 1, so any later person edit (pause, delete) wins over a migration run on another Mac. */
export const ruleRecord = (id: string, d: RuleDraft, state: RuleState, source: RuleSource, nowMs: number): TrackedRecord =>
  ({ kind: 'rule', id, updatedMs: source === 'migrated' ? 1 : nowMs, deleted: false, body: { kind: d.kind, text: d.text, sport: d.sport, ...(d.exerciseIds ? { exerciseIds: d.exerciseIds } : {}), ...(d.goal ? { goal: d.goal } : {}), state, source, atMs: nowMs } });

const ALLOWED: Record<RuleState, RuleState[]> = { proposed: ['active', 'declined'], active: ['paused'], paused: ['active'], declined: [] };

/** The record in its next state, stamped above what it has, or null when that move is not allowed. */
export function moveRule(r: TrackedRecord, to: RuleState, nowMs: number): TrackedRecord | null {
  const c = r.kind === 'rule' && !r.deleted ? readRule(r.id, r.body) : null;
  if (!c || !ALLOWED[c.state].includes(to) || !isObj(r.body)) return null;
  return { ...r, updatedMs: above(nowMs, r), body: { ...r.body, state: to } };
}

/** The tombstone for a rule (delete). */
export const deleteRule = (r: TrackedRecord, nowMs: number): TrackedRecord => ({ ...r, deleted: true, updatedMs: above(nowMs, r) });

/** Live, readable rule records, oldest first. */
export const rulesOf = (records: readonly TrackedRecord[]): Rule[] =>
  records.flatMap((r) => { const c = r.kind === 'rule' && !r.deleted ? readRule(r.id, r.body) : null; return c ? [c] : []; }).sort((a, b) => a.atMs - b.atMs || (a.id < b.id ? -1 : 1));

/** The active rules for a sport (rules for 'all' count for every sport). `nowMs` is for symmetry with later expiry; a rule has none yet. */
export function activeRules(records: readonly TrackedRecord[], sport: SportKey, _nowMs: number): Rule[] {
  return rulesOf(records).filter((r) => r.state === 'active' && r.kind !== 'goal' && (r.sport === sport || r.sport === 'all'));
}

/** The union of the exercises named by active exclude rules, whatever the rule's sport. */
export function excludedIds(records: readonly TrackedRecord[]): Set<string> {
  return new Set(rulesOf(records).filter((r) => r.state === 'active' && r.kind === 'exclude').flatMap((r) => r.exerciseIds ?? []));
}

/** The texts of the active wishes for a sport. */
export const wishes = (records: readonly TrackedRecord[], sport: SportKey): string[] =>
  activeRules(records, sport, 0).filter((r) => r.kind === 'wish').map((r) => r.text);

const PRIO_WORDS: Record<Prio, string> = { focus: 'Schwerpunkt', equal: 'gleichrangig', keep: 'erhalten' };
const SPORT_WORDS: Record<SportKey, string> = { gym: 'Kraft', bike: 'Rad', run: 'Laufen' };

/** One prompt line with the person's sport priorities, or null when none is set. */
export function priorityLine(goal: Pick<GoalBody, 'sports'>): string | null {
  const parts = SPORT_KEYS.flatMap((k) => (goal.sports[k] ? [`${SPORT_WORDS[k]} ${PRIO_WORDS[goal.sports[k]!]}`] : []));
  return parts.length ? `Sportarten nach Wunsch der Person: ${parts.join(', ')}.` : null;
}

/** One prompt line with the active wishes, or null when there are none. Wishes cannot be checked, so the line says so. */
export const wishLine = (texts: readonly string[]): string | null =>
  texts.length ? `Wünsche der Person (nicht prüfbar): ${texts.map((t) => t.replace(/\s+/g, ' ').trim()).join('; ')}` : null;

/**
 * What makes the coaches plan again: active or paused exclude and wish rules (id, state, exercises, text) and the goal record.
 * Proposals, declines and deleted rules are not in it, so they never trigger a replan. '' when there is nothing.
 */
export function personalKeyOf(ruleRecords: readonly TrackedRecord[], goalRecords: readonly TrackedRecord[], frameRecords: readonly TrackedRecord[] = []): string {
  const parts = rulesOf(ruleRecords)
    .filter((r) => (r.state === 'active' || r.state === 'paused') && r.kind !== 'goal')
    .map((r) => `${r.id}:${r.state}:${(r.exerciseIds ?? []).join(',')}:${r.text}`);
  for (const g of goalRecords) parts.push(`goal:${g.id}:${g.updatedMs}:${g.deleted ? 1 : 0}`);
  // A new mode or time makes the plans fit again.
  for (const f of frameRecords) parts.push(`frame:${f.id}:${f.updatedMs}:${f.deleted ? 1 : 0}`);
  return parts.sort().join('|');
}

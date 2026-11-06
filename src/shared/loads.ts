import { z } from 'zod';
import type { TrackedRecord } from './records';
import { titleHash } from './exercise-links';
import { ruleNumber, ruleNumbers, ruleValues } from './training-policy';

/** Weight steps learned per exercise and studio, reachable weights and barbell plates. Pure, shared by app and coach. Product values: see the `load.*` rules. */
export type Ladder = { stepKg: number; anchorKg: number; learned: boolean };

const GRID = 4; // weights are worked on a 0.25 kg grid
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** The step and the anchor from the weights (> 0) of one exercise in one studio. `equipment` is the catalog's equipment. */
export function learnLadder(weights: readonly number[], equipment: string): Ladder {
  const defaults = ruleValues('load.default-step');
  const def = defaults[equipment] ?? defaults.other;
  const units = [...new Set(weights.filter((w) => w > 0).map((w) => Math.round(w * GRID)))].sort((a, b) => a - b);
  const anchorKg = units.length > 0 ? units[0] / GRID : equipment === 'barbell' ? ruleNumber('load.bar-kg') : 0;
  if (units.length < 2) return { stepKg: Math.max(0.5, def), anchorKg, learned: false };
  let g = 0;
  for (let i = 1; i < units.length; i++) g = gcd(g, units[i] - units[i - 1]);
  const d = g / GRID;
  // Few data points overestimate the step: a multiple of the default is read as the default.
  const step = d <= def ? d : Number.isInteger(round2(d / def)) ? def : d;
  return { stepKg: Math.max(0.5, step), anchorKg, learned: true };
}

const EPS = 1e-6;

/** The smallest reachable weight above `w`. */
export function nextUp(w: number, l: Ladder): number {
  if (w < l.anchorKg - EPS) return l.anchorKg;
  return round2(l.anchorKg + (Math.floor((w - l.anchorKg) / l.stepKg + EPS) + 1) * l.stepKg);
}

/** The largest reachable weight at or below `w`, never below the anchor. */
export function snapDown(w: number, l: Ladder): number {
  if (w <= l.anchorKg + EPS) return l.anchorKg;
  return round2(l.anchorKg + Math.floor((w - l.anchorKg) / l.stepKg + EPS) * l.stepKg);
}

// --- the person's override: record kind `loadstep` ---

export type LoadStep = { exerciseId: string; studio: string; stepKg: number };
export type LoadStepOverrides = Map<string, number>;

const bodySchema = z.object({
  exerciseId: z.string().min(1).max(200), studio: z.string().max(40),
  stepKg: z.number().refine((n) => ruleNumbers('load.step-choices').includes(n)),
});

export const loadStepId = (exerciseId: string, studio: string): string => `step-${titleHash(`${exerciseId}|${studio}`)}`;
const keyOf = (exerciseId: string, studio: string): string => `${exerciseId}|${studio}`;

/** The body of a `loadstep` record, or null for anything else (a step that is not on offer, a missing exercise). */
export function readLoadStep(body: unknown): LoadStep | null {
  const p = bodySchema.safeParse(body);
  return p.success ? { exerciseId: p.data.exerciseId, studio: p.data.studio, stepKg: p.data.stepKg } : null;
}

/** The record that sets the step. A tombstone is the same record with `deleted: true` and a newer stamp. */
export const loadStepRecord = (exerciseId: string, studio: string, stepKg: number, updatedMs: number): TrackedRecord =>
  ({ kind: 'loadstep', id: loadStepId(exerciseId, studio), updatedMs, deleted: false, body: { exerciseId, studio, stepKg } });

/** Live, readable `loadstep` records by exercise and studio. Deleted and malformed ones count for nothing. */
export function loadStepOverrides(records: readonly TrackedRecord[]): LoadStepOverrides {
  const out: LoadStepOverrides = new Map();
  for (const r of records) {
    if (r.kind !== 'loadstep' || r.deleted) continue;
    const s = readLoadStep(r.body);
    if (s) out.set(keyOf(s.exerciseId, s.studio), s.stepKg);
  }
  return out;
}

/** The learned ladder with the person's step, if any. The anchor stays. */
export function withOverride(l: Ladder, overrides: LoadStepOverrides, key: { exerciseId: string; studio: string }): Ladder {
  const s = overrides.get(keyOf(key.exerciseId, key.studio));
  return s === undefined ? l : { ...l, stepKg: s };
}

// --- plates (barbell) ---

export type Plates = { status: 'exact' | 'between' | 'below-bar'; perSide: number[]; lower?: number; upper?: number };

/** Plates per side for a total, greedy with the register's plates in unlimited pairs. 'between': the two nearest exact totals. */
export function platesPerSide(totalKg: number): Plates {
  const bar = ruleNumber('load.bar-kg');
  if (totalKg < bar - EPS) return { status: 'below-bar', perSide: [] };
  const plates = [...ruleNumbers('load.plates')].sort((a, b) => b - a);
  let rest = Math.round(((totalKg - bar) / 2) * 100); // hundredths of a kg per side
  const perSide: number[] = [];
  for (const p of plates) {
    const u = Math.round(p * 100);
    while (rest >= u) { perSide.push(p); rest -= u; }
  }
  if (rest === 0) return { status: 'exact', perSide };
  const lower = round2(bar + 2 * perSide.reduce((a, b) => a + b, 0));
  return { status: 'between', perSide, lower, upper: round2(lower + 2 * plates[plates.length - 1]) };
}

import { RULES } from './rules';
import type { PolicyRule } from './types';

export * from './types';
export { SOURCES } from './sources';
export { RULES } from './rules';
export { SCENARIOS } from './scenarios';

/** Bumped whenever a rule, value or status changes. Plans can name the version they were made with. */
export const POLICY_VERSION = '2026-11-06.1';

const BY_ID = new Map(RULES.map((r) => [r.id, r]));

export function policyRule(id: string): PolicyRule {
  const rule = BY_ID.get(id);
  if (!rule) throw new Error(`unknown policy rule: ${id}`);
  return rule;
}

export function ruleNumber(id: string): number {
  const v = policyRule(id).value;
  if (typeof v !== 'number') throw new Error(`policy rule ${id} has no single number`);
  return v;
}

export function ruleRange(id: string): { min: number; max: number } {
  const v = policyRule(id).value;
  if (v === undefined || typeof v === 'number') throw new Error(`policy rule ${id} has no range`);
  return v;
}

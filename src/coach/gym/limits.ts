import { POLICY_VERSION, ruleNumber } from '../../shared/training-policy';

/**
 * Our own choices for the gym coach, not taken from research. The values live in the policy register
 * (src/shared/training-policy/rules.ts), which also says which follow-up task replaces each one.
 */
export const GYM_POLICY_VERSION = POLICY_VERSION;
export const RECENT_DAYS = ruleNumber('gym.recent-days');
export const LONG_BREAK_DAYS = ruleNumber('gym.long-break-days');
/** Sessions of one exercise needed within COMPARABLE_DAYS before the coach changes anything. */
export const MIN_COMPARABLE = ruleNumber('gym.min-comparable');
export const COMPARABLE_DAYS = ruleNumber('gym.comparable-days');
export const STEP_BACK = ruleNumber('gym.step-back-share');
/** Comparable sessions in a row with fewer reps at the same weight before the weight steps back. */
export const DROP_STEP_BACK = ruleNumber('gym.drop-step-back-count');
export const MAX_EXERCISES = ruleNumber('gym.max-exercises');
export const MAX_SETS = ruleNumber('gym.max-sets');
export const MAX_FAILURE_SETS = ruleNumber('gym.max-failure-sets');
export const MAX_WIDOWMAKERS = ruleNumber('gym.max-widowmakers');

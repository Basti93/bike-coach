import { POLICY_VERSION, ruleNumber, ruleRange } from '../../shared/training-policy';

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
/** Sessions in a row with "0 left" before the weight steps back. */
export const EFFORT_STEP_BACK = ruleNumber('gym.effort-step-back-count');
/** The weight rises by at most this share, or MIN_STEP_KG when that is more. */
export const MAX_STEP_PCT = ruleNumber('gym.max-step-pct');
export const MIN_STEP_KG = ruleNumber('gym.min-step-kg');
export const REP_MIN = ruleRange('gym.rep-range').min;
export const REP_MAX = ruleRange('gym.rep-range').max;
export const MAX_EXERCISES = ruleNumber('gym.max-exercises');
export const MAX_SETS = ruleNumber('gym.max-sets');
export const MAX_FAILURE_SETS = ruleNumber('gym.max-failure-sets');
export const MAX_WIDOWMAKERS = ruleNumber('gym.max-widowmakers');

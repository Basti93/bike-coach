/** Our own choices for the gym coach, not taken from research. See docs/gym-foundations.md. */
export const RECENT_DAYS = 120;
export const LONG_BREAK_DAYS = 28;
/** Sessions of one exercise needed within COMPARABLE_DAYS before the coach changes anything. */
export const MIN_COMPARABLE = 2;
export const COMPARABLE_DAYS = 56;
export const STEP_BACK = 0.9;
/** The weight rises by at most this share, or MIN_STEP_KG when that is more. */
export const MAX_STEP_PCT = 5;
export const MIN_STEP_KG = 2.5;
export const REP_MIN = 6;
export const REP_MAX = 12;
export const MAX_EXERCISES = 10;
export const MAX_SETS = 30;
export const MAX_FAILURE_SETS = 4;
export const MAX_WIDOWMAKERS = 1;

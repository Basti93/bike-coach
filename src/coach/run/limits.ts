// Our own choice: the first minutes of a run are not easy-pace data yet.
export const WARMUP_S = 300;
// Our own choice: steeper than 3 % over the window and the pace says little about fitness.
export const MAX_GRADE = 0.03;
// Our own choice: the grade is measured over the trailing 30 s.
export const GRADE_WINDOW_S = 30;
// Our own choice: a gap longer than 5 s between records is a dropout, not running time.
export const MAX_GAP_S = 5;
// Our own choice: at or below 0.5 m/s the person is standing.
export const MIN_SPEED = 0.5;
// Our own choice: less than 5 easy minutes is too little for a pace.
export const MIN_EASY_S = 300;
// Our own choice: a test run is the best 30 minutes.
export const TEST_WINDOW_S = 1800;
// Our own choice: after a closed leg complaint, the plan starts gently again for a week.
export const RESTART_DAYS = 7;
// Our own choice: the easy band starts at 60 % of max heart rate.
export const BAND_LOW_PCT = 0.60;
// Our own choice: the easy cap, and the top of the band, is 75 % of max heart rate.
export const HR_CAP_PCT = 0.75;
// Our own choice: the easy pace at a time is the mean of the last 5 qualifying runs ...
export const TREND_RUNS = 5;
// ... within the 28 days before it.
export const TREND_DAYS = 28;

// ---- The rule plan ----
// Our own choice: the weekly run time rises at most 10 % over the mean of the last 3 complete weeks.
export const MAX_RAMP = 0.10;
// Our own choice: every fourth week of a phase is lighter ...
export const LIGHT_EVERY = 4;
// ... at 70 % of the time.
export const LIGHT_FACTOR = 0.7;
// Our own choice: a planned run lasts at least 15 minutes; fewer minutes mean fewer runs.
export const MIN_RUN_MIN = 15;
// Our own choice: no planned run lasts longer than 2 hours.
export const MAX_RUN_MIN = 120;
// Our own choice: at most 5 runs a week.
export const MAX_RUNS = 5;
// Our own choice: in phase 2 the long run aims at 35 % of the week ...
export const LONG_SHARE = 0.35;
// ... and no run is more than 10 minutes longer than the longest run of the last 3 weeks.
export const LONG_STEP_MIN = 10;
// Our own choice: a test run is due 28 days after the last one.
export const TEST_EVERY_DAYS = 28;
// Our own choice: a test run is 10 minutes warm-up, 30 minutes steady and hard, 5 minutes cool-down ...
export const TEST_WARM_MIN = 10;
export const TEST_MAIN_MIN = 30;
export const TEST_COOL_MIN = 5;
// ... and its minutes count double in the weekly load.
export const TEST_LOAD = 2;
// Our own choice: a healing complaint, a closed one in its first week, or pain in the answers halve the minutes.
export const HALF = 0.5;
// Our own choice: phase 2 starts after at least 3 runs a week ...
export const PHASE2_RUNS = 3;
// ... in 4 ...
export const PHASE2_WEEKS = 4;
// ... of the last 5 complete weeks.
export const PHASE2_OF = 5;
// Our own choice: 21 days without a run go back to phase 1.
export const GAP_DAYS = 21;
// Our own choice: without runs and without answers, the start is 2 runs of 20 minutes.
export const DEFAULT_RUNS = 2;
export const DEFAULT_MIN = 20;

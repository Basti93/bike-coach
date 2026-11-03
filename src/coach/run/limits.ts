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

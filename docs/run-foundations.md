# Run coach foundations

The rules behind the run coach's weekly plan. Every number below is our own choice, not taken from research. They are cautious defaults for getting back into running and building distance before speed, and they live in `src/coach/run/limits.ts`. The rule plan uses them on its own, so it stands whenever Claude is unavailable. Claude may only adjust a plan inside these limits.

The coach makes no medical claims. It does not promise a health effect, does not name a diagnosis, and treats every value as a planning aid.

## Phases

- **Phase 1, "wieder fit".** Easy runs only, at a conversational effort. With a known max heart rate there is a cap at 75 % of it. Without one, runs are planned by feel ("so, dass du dich noch unterhalten kannst") and by time.
- **Phase 2, "Distanz".** One long run a week grows step by step. It goes on the latest running day of the week that has no hard session and does not follow leg training; without such a day there is no long run that week, and the other runs stay at the usual recent length. The other runs stay easy. Speed work is not planned, apart from the occasional test run.
- **Into phase 2:** at least 3 runs a week in 4 of the last 5 complete weeks. A week with an active run complaint does not count.
- **Back to phase 1:** 21 days without a run. The new phase starts on that day.

## The weekly plan, step by step

1. **Base.** The mean run time of the last 3 complete weeks, counting only the weeks since the first run on record and, after a closed complaint, since the restart week. Without runs in those weeks, the answers from the questionnaire start the plan, at most 3 runs of at most 30 minutes and at most 90 minutes a week, because "usual" may describe running before a break. Without answers, 2 runs of 20 minutes.
2. **Ramp.** With a base from runs, the week may rise at most 10 % over it. A few short runs never plan less than a gentle start of 2 × 20 minutes, or less if the answers say so.
3. **Light week.** Every fourth week of a phase has 70 % of the time.
4. **Complaint.** An active run complaint pauses running. A healing one, a complaint closed within the last 7 days, or "pain while running: yes" in the answers halves the time and removes the test run.
5. **Cross-sport load.** A week whose bike and gym minutes lie above the person's 4-week mean cuts the run time by the excess, at most 20 %.
6. **Spread.** The minutes go to the chosen weekdays from the first plannable date on. When the plan starts mid-week, only the share of the remaining days is planned, so missed minutes never move to later days. Days with a hard session are filled last.

## Limits

| Limit | Value | Meaning |
| --- | --- | --- |
| MAX_RAMP | 0.10 | The week rises at most 10 % over the mean of the last 3 weeks |
| LIGHT_EVERY | 4 | Every fourth week of a phase is lighter |
| LIGHT_FACTOR | 0.7 | A light week has 70 % of the time |
| MIN_RUN_MIN | 15 | A planned run lasts at least 15 minutes; fewer minutes mean fewer runs |
| MAX_RUN_MIN | 120 | No planned run lasts longer |
| MAX_RUNS | 5 | At most 5 runs a week |
| LONG_SHARE | 0.35 | The long run aims at 35 % of the week |
| LONG_STEP_MIN | 10 | No run is more than 10 minutes longer than the longest run of the last 3 weeks |
| TEST_EVERY_DAYS | 28 | A test run is due 28 days after the last one |
| TEST_WARM_MIN | 10 | Test run warm-up |
| TEST_MAIN_MIN | 30 | Test run main part, steady and hard; its distance is the value |
| TEST_COOL_MIN | 5 | Test run cool-down |
| TEST_LOAD | 2 | Test minutes count double in the weekly load |
| HALF | 0.5 | The factor for a healing complaint, a restart week or pain in the answers |
| PHASE2_RUNS | 3 | Runs a week that count toward phase 2 |
| PHASE2_WEEKS | 4 | Weeks with enough runs needed for phase 2 ... |
| PHASE2_OF | 5 | ... out of the last complete weeks |
| GAP_DAYS | 21 | Days without a run that start phase 1 again |
| DEFAULT_RUNS | 2 | Runs a week without runs and without answers |
| DEFAULT_MIN | 20 | Minutes per run without runs and without answers |
| ANSWER_START_MAX_MIN | 90 | The most minutes of a first week planned from answers alone |
| ANSWER_RUN_MAX_MIN | 30 | The longest run of a first week planned from answers alone |
| ANSWER_MAX_RUNS | 3 | The most runs of a first week planned from answers alone |
| MAX_RUN_STEP | 1 | The number of runs grows by at most 1 over last week's runs |

The easy band (60 % to 75 % of max heart rate), the cap, and the easy-pace smoothing are also in `limits.ts` and are our own choices too.

## Test runs

A test run is 10 minutes warm-up, 30 minutes at a steady hard effort, and 5 minutes cool-down. Its value is the distance in the best 30 minutes, which works at any fitness level. Best times appear only for these runs. A test run:

- is due 28 days after the later of the last test (or switching running on) and the start of the phase or of a restart, so never in the first 4 weeks after a break,
- is never planned in a light week, with a complaint, or with pain in the answers,
- replaces one easy run, never the long run or the day before it, and is planned only when the week has room for its weighted 90 minutes plus at least one more run of 15 minutes,
- goes only on a fresh day: nothing harder than an easy session that day, no leg training or hard session the day before, and no hard session the day after. Without such a day there is no test that week.

It is an offer. The plan says so, and an easy run instead is always fine.

## One hard thing a day

Easy and long runs are not hard, so they may share a day with an easy ride. A test run is the only hard run, and it never goes on a day that already has a hard thing.

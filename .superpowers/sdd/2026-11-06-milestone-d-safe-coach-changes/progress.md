# Milestone D ledger

Plan: docs/superpowers/plans/2026-11-06-milestone-d-safe-coach-changes.md
Branch: milestone-d-safe-coach-changes

## Claude decided (the person handed product questions to Claude)
- One `change` record for next-workout proposals; workout changes stored atomically inside the workout (`changes` with prior rows).
- Undo windows: workout change while the workout is open and the rows untouched; next change until it is used; week plan until the next change of the plan.
- Week plan take checks the stored version against the shown one; no server-side conflict detection (parked).
- Coach never edits routines in D.

## Tasks
- T1 workout changes: 78408d1. Review no must-fix. For final fix: no "Übernommen." when all ops rejected (show "Nicht übernommen." + Geht-nicht line); finish keeps change ids but drops prior/after (T2 needs ids for idempotent start); edited-since compares weight/reps/set count only; missing row → "Übung nicht mehr da"; doneMs >= atMs; clear stale line state.
- T2 next changes: 74a7c6f. Furthest state wins inside applyRecord for kind change. lighter = 10% (LIGHTER_PCT) → final fix: snap to reachable step (ladderFrom). Open: taking a change does not trigger a replan (preview line at next replan); week chat cannot swap reliably (no catalog block) — parked.
- Pre-existing failure since 07.11: tests/coach/runtime.test.ts:322 (Garmin run check, date-dependent) → fix in final round.
- T2 review, for final fix: lighter snaps to the ladder (ladderFrom/snapDown) in applyNextChanges and startFromPlan; `sets` op on exercise without working sets → skip with note; tombstone of kind change ranks highest (deterministic convergence).
- T3 week undo: 4eafffb. For final fix: undo also requires the stored days to equal the proposal's days (a later manual edit that keeps takenFrom must not be overwritten).
- T3 review, for final fix: the take check compares the stored weekplan's updatedMs with the proposal message's own time (persistent, survives remount) instead of a render-time ref; disable Übernehmen while plans load.
- Final fixes 52551ad (runtime test: real clock on a Saturday → fixed Monday clock, code fine). Opus final review → next changes used only when applied and marked at finish; week undo from stored data + `undoes`; one wording (src/shared/wording.ts). 2577 tests green. Merged.

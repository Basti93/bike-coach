# Milestone C ledger

Plan: docs/superpowers/plans/2026-11-06-milestone-c-loads-fit-equipment.md
Branch: milestone-c-loads-fit-equipment

## Person decided (06.11.2026)
- Steps learned from logged weights, correctable per exercise.
- Several studios, separate histories.
- Plate calculator in C.

## Claude decided
- Workouts without studio belong to the main studio = studio of the earliest workout that has one (no extra record).
- Studio list per profile from own workouts; step override per profile (record kind `loadstep`). Household sharing parked.
- Ladder: gcd of differences on 0.25 grid, equipment default when < 2 distinct weights or gcd a multiple of default.
- Plates: 20 kg bar, standard plates unlimited pairs; own inventory parked.
- 0 left treated like unknown effort; step back only after 2 drops in a row or long break.
- Guardrails snap planned weights down to the ladder instead of rejecting.
- Rep range per exercise = rep range of its muscle group from the register.

## Tasks
- T1 Studio: edcd695. Review: no must-fix. For final fix: UI test picker→begin→record.studio; mainStudio tie-break by id; reuse known name ignoring case on new-name commit.
- T2 Loads: ca05d5e. Review: no must-fix. For final fix: platesPerSide guard non-finite input; tests for 1.25 grid with 61.25 and validBody('loadstep').
- T3 Progression: 4ee2ad9. Accepted deviation: step-back may go one step below the lightest seen weight (barbell: down to bar); anchor = exact lightest weight (Hevy 22.68 stays on its own grid).
- T3 review, for final fix: (MUST) drop rule counts only drops at exactly the same weight (a rise resets reps); ladder learns from normal+failure sets only; rule workout start reps from repRangeOf; guardrail snap never raises a weight (min with original); docs/gym-foundations.md update.
- T4 Display: b6107b1. Screenshot check: "Ziel 6–12" repeated on every set (too many numbers) → only on the first working set; studio label + select stacked → one inline line.
- Final fixes 1cb7660; Opus final review → 2604421 (lastValues per studio, one shared ladderFrom). 2529 tests green, typecheck clean. Parked: coach plans for last studio only; own inventory; no sharing between profiles.

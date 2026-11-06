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

# Milestone D ledger

Plan: docs/superpowers/plans/2026-11-06-milestone-d-safe-coach-changes.md
Branch: milestone-d-safe-coach-changes

## Claude decided (the person handed product questions to Claude)
- One `change` record for next-workout proposals; workout changes stored atomically inside the workout (`changes` with prior rows).
- Undo windows: workout change while the workout is open and the rows untouched; next change until it is used; week plan until the next change of the plan.
- Week plan take checks the stored version against the shown one; no server-side conflict detection (parked).
- Coach never edits routines in D.

## Tasks

# Milestone E ledger

Plan: docs/superpowers/plans/2026-11-07-milestone-e-rules-and-goals.md
Branch: milestone-e-rules-and-goals

## Claude decided (person handed product questions to Claude)
- Checkable rule = list of concrete exercise ids (coach proposes all catalog variants, person sees them before taking); everything else is a wish.
- Rules always start as proposals from chat; manual rules in the card are created directly.
- Own additions via ExercisePicker are not blocked.
- Goal record per profile: strength goal (muscle/strength/fitness), ≤3 focus muscles, per-sport priority focus/equal/keep; default = today's 'muscle'.
- Old Mac-side gym/bike rule texts migrate once into wish records; old paths removed. Complaints and coach tasks stay.

## Tasks
- T1 records: aae23b5 (rule ranks proposed0 < active/paused1 < declined2 < tombstone4). Review, for final fix: keep legacy rules in memory and write no state until migration succeeded; migrated records stamped updatedMs=1 so person edits always win.
- T2 enforcement: 7b27978. For final fix: a change of rule/goal records marks the gym (and run/bike) coach dirty so the next plan follows at once (acceptance 5 "sofort").
- T2 review, for final fix: client start-time filter must also catch Hevy-linked plan exercises (resolve plan exercise via catalog/resolveExercise to own id before matching); filter the start-screen plan preview; drop excluded titles from the outlook; filter excluded exercises out of the chat prompt catalog.
- T3 chat proposals: 430042c (catalog block only on a retry when no valid id). For final fix: goal proposals get Rückgängig too (store prior goal on the rule record; undo restores it only if the goal is unchanged since).
- T3 review, for final fix: prompt sentence "bei einer Regel nextChange null, keine lasting-Aufträge"; workout chat validates against this.catalogOf; rules list ignores proposed rules (orphans); empty goal draft → null; RuleCard shows "Gelöscht." for a rule tombstoned elsewhere (not "Rückgängig gemacht.").
- T4 card 03d1a98; final fixes ddbf990; Opus review → replan key only from active rules + goal, one exclusion resolver src/shared/excluded.ts. 2629 tests green. Merged.

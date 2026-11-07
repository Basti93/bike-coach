# Milestone G ledger

Plan: docs/superpowers/plans/2026-11-07-milestone-g-changeable-training.md
Branch: milestone-g-changeable-training

## Claude decided
- Reorder via "Nach oben/unten" in the exercise menu (no drag and drop).
- Movement block = B muscle group of the exercise.
- Warm-up offered in the app, automatic only in the coach rule plan; ramp 40%x5, 60%x3, 80%x2, barbell bar x10 first; no ramp without a working weight.
- Rest: explicit restS wins, else register by kind (heavy/compound/isolation); superset rests once per round.
- D undo gets an anchor rid so reorders don't misplace restored rows.

## Tasks
- T1 rest: d2f01c0. For final fix: compound = big group AND at least one secondary muscle in another group (catalog data), so leg curl/cable row classify by movement not equipment; UI tests for +30 s and Pause select.
- T1 review, for final fix: Hevy routine export sends restOf(e) rounded and clamped 0..600 instead of null.
- T2 reorder ca212b6 (review clean). T3 supersets 25e8e98. Review, for final fix: rounds keyed by work-set index, warm-ups run before their exercise's first round (important now that T4 inserts warm-ups); linkWith refuses partners whose group has a started member; tidyGroups after undoChange; prompt says superset groups must be adjacent; Hevy body also dissolveSingles.
- T4 warm-up fbef1fd; final fixes c262c37; Opus review → rule plans restS null, restOf with full catalog everywhere, warm-up rest 30 s, swaps drop restS. Merged.

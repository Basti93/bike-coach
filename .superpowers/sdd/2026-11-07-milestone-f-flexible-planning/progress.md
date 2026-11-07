# Milestone F ledger

Plan: docs/superpowers/plans/2026-11-07-milestone-f-flexible-planning.md
Branch: milestone-f-flexible-planning

## Claude decided
- Frame record (mode week/spontaneous, usual minutes, minutes for today only).
- "Was geht heute" is a fixed explainable rule, no AI call.
- Combination only with at most one hard part, only on the person's wish.
- Gym duration = warm-up + sets × (work + rest) + changes; values in the register.
- Rule fallback goes through checkWorkout and is trimmed to the time budget.

## Tasks
- T1 frame/duration/budget: 2f896d8. For final fix: frame changes trigger a replan (add to personalKeyOf or a frame key); Task 4 plan card shows "ca. N Min".
- T1 review, for final fix: budget date skips a day that already has a gym workout; reason notes "länger als deine Zeit" when even the minimal plan exceeds the budget; import order in duration.ts.
- T2 combination (commit before d236470), T3 today advice d236470. Review, for final fix: parseProposal drops `also` when both parts are hard; plan-hint in week mode adds no "Heute passt" line when today has no plan day.
- T4 UI 2c6e78d; final fixes f80e865 (advice keeps sport, one today card, coach publishes advice in stats record). Opus review → no-legs enforced in checkWorkout + prompt, replan on advice change (advice-seen.json). Merged.

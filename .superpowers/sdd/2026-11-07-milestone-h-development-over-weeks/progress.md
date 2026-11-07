# Milestone H ledger

Plan: docs/superpowers/plans/2026-11-07-milestone-h-development-over-weeks.md
Branch: milestone-h-development-over-weeks

## Claude decided
- Temporary focus = optional `temporary` overlay in the goal record; base goal stays; end shown once for 14 days.
- Focus muscle groups raise the weekly set range by a register factor (1.3).
- Next-time reasons come from the coach (suggestNext reason) via the stats record; the app does not recompute.
- "Zuletzt geändert": notes from bike/gym/run published in the stats record.
- Coach tasks become synced `task` records (migrated once from tasks.json).
- Chat retention stays 90 days; only display changes.

## Tasks
- T1 temporary focus: 9752a5d. Review, for final fix (RulesCard): spread old temporary instead of rebuilding (keep endedSeenMs); while a temporary is active, the sport-priority select and focus toggles edit the temporary (until stays; does not extend on each toggle); add "Jetzt beenden" that removes temporary.
- T2 35e5202, T3 4aa5d4b, T4 eaf5c05; RulesCard fixes 5aa85d2; Opus review → change notes written once (76b94c6). 2767 tests green. Merged.

# Gym coach foundations

Status note, 2026-11-06: this document describes the existing coach and its limits. The [updated training science foundation](research/2026-11-06-training-science-foundation.md) and [adaptive coach concept](superpowers/specs/2026-11-06-adaptive-training-coach-design.md) distinguish current behaviour from proposed changes; those changes are not implemented by updating these documents.

The training knowledge behind the gym coach, as a source for its prompt. The findings are tendencies, never certainties.


## Training knowledge

Researched on 2026-11-02. Several findings come from secondary summaries or preprints, so the coach states them as tendencies and never as certainties.

- **Volume.** More weekly sets per muscle tend to bring more growth, with diminishing returns ([Pelland et al., published 2026](https://pubmed.ncbi.nlm.nih.gov/41343037/); originally linked here as a preprint). Direct and indirect contributions need explicit interpretation; this does not establish universal minimum quotas for every muscle.
- **Frequency.** With equal volume, frequency has little effect on growth ([Schoenfeld et al., 2019](https://pubmed.ncbi.nlm.nih.gov/30236847/)). So one or two sessions a week can work, and the coach never treats a low frequency as a flaw. Its limit is how much quality volume fits into those sessions.
- **Failure.** Getting closer to failure tends to bring more growth, non-linearly, but actually reaching momentary failure shows no clear advantage over stopping just short of it ([Refalo et al., 2023](https://dro.deakin.edu.au/articles/journal_contribution/Influence_of_Resistance_Training_Proximity-to-Failure_on_Skeletal_Muscle_Hypertrophy_A_Systematic_Review_with_Meta-analysis/22030796), [summary of Robinson et al.](https://biolayne.com/reps/issue-32/the-failure-factor-the-relationship-between-proximity-to-failure-and-strength-and-hypertrophy/)). This is where science and the old-schooler meet: sets must be truly hard, and failure is a tool and not a duty.
- **Drop sets.** Similar growth to conventional training in far less time, but from few and short studies ([Sødal et al., 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10390395/)). They suit a short session.
- **Supersets.** A [dedicated meta-analysis published in 2025](https://pubmed.ncbi.nlm.nih.gov/39903375/) reports time savings and broadly similar chronic adaptations, with higher perceived effort and differences between pairings. The earlier statement here that no dedicated meta-analysis was found was incomplete. See the updated foundation for the proposed planning policy.
- **Pyramid sets.** No evidence of an advantage, and one non-peer-reviewed review advises against them ([Brookbush](https://brookbushinstitute.com/courses/set-strategies-supersets-pyramid-sets-and-drop-sets)). The coach offers them for variety or because the rider likes them, and does not claim more.
- **Ramping sets.** The stepping stones up to the working weight, with sparse research on any effect ([BarBend](https://barbend.com/?p=167498)). Treat them as preparation, mainly before heavy compound lifts.
- **Widowmaker.** One set of 20 reps at about a 10-rep maximum, with pauses between reps once the first set of reps is done ([Lift Vault](https://liftvault.com/resources/widowmaker-sets/)). It is not an everyday tool, and it is rare and deliberate here. It is an old-school method with no dedicated evidence that the coach knows of, which it may say openly. The safety rule below applies: not on a lift where failing is dangerous without a spotter or safeties.
- **Breaks.** Early losses are largely neural and muscle comes back quickly on retraining ([review](https://www2.mdpi.com/2813-0413/1/1/1)). After a break the coach goes back a little without drama.
- **Progression.** The research did not produce a specific study on double progression (reps first, then weight). It is a chosen method and the coach does not present it as proven.

**In Hevy** (official schema of `POST /v1/routines`, checked on 2026-11-02): set types are `warmup`, `normal`, `failure` and `dropset`. Exercises have `superset_id`, `rest_seconds` and `notes`; sets have `weight_kg`, `reps` and `rep_range`; routines have `folder_id` and `notes`. So ramping sets become warmup sets, pyramids become differing weights, supersets use `superset_id`, and a widowmaker has no type of its own and goes into the exercise notes. This schema does not specify whether updating a routine keeps it in its folder; the builder verifies it.

## Limits

These limits are our own choice, not taken from research. Their single source is the policy register `src/shared/training-policy/rules.ts` (ids `gym.*`), which also records which follow-up task replaces each one; `src/coach/gym/limits.ts` only reads them.

- RECENT_DAYS: an exercise counts as available if done within this time.
- LONG_BREAK_DAYS: longer without an exercise means a step back to STEP_BACK of the last weight.
- MIN_COMPARABLE / COMPARABLE_DAYS: occurrences of an exercise needed within that window before changing anything.
- **Progression.** The rep range comes from the exercise's muscle group. The weight goes up to the next reachable step in the planned studio: steps are learned per exercise and studio from the work sets (normal and failure, not warmups or dropsets), and the person can override them. "0 left" is not punished on its own; the numbers decide. The weight steps back after two drops in reps at exactly the same weight, or after a long break. A weight rise resets the reps to the range's start and is no drop.
- MAX_EXERCISES, MAX_SETS, MAX_FAILURE_SETS, MAX_WIDOWMAKERS: per workout.

## Progression rule

"All reps reached" means every normal or failure set at the heaviest weight of the last session did at least as many reps as the lowest such set of the session before, at the same or a lower weight. Warmup and drop sets are ignored. Then reps rise by one; at REP_MAX the weight rises and reps go back to REP_MIN. Bodyweight exercises only add reps.

Weighted exercises keep their suggested reps within REP_MIN to REP_MAX; bodyweight reps may exceed REP_MAX (more reps is the only progression there) but never fall below 1.

# Gym coach foundations

The training knowledge behind the gym coach, as a source for its prompt. The findings are tendencies, never certainties.


## Training knowledge

Researched on 2026-11-02. Several findings come from secondary summaries or preprints, so the coach states them as tendencies and never as certainties.

- **Volume.** More weekly sets per muscle tend to bring more growth, with diminishing returns ([Pelland et al., preprint](https://sportrxiv.org/index.php/server/preprint/download/460/967/908), [summary](https://biolayne.com/reps/issue-31/the-king-of-volume-metas/)). This is the main lever.
- **Frequency.** With equal volume, frequency has little effect on growth ([Schoenfeld et al., 2019](https://pubmed.ncbi.nlm.nih.gov/30236847/)). So one or two sessions a week can work, and the coach never treats a low frequency as a flaw. Its limit is how much quality volume fits into those sessions.
- **Failure.** Getting closer to failure tends to bring more growth, non-linearly, but actually reaching momentary failure shows no clear advantage over stopping just short of it ([Refalo et al., 2023](https://dro.deakin.edu.au/articles/journal_contribution/Influence_of_Resistance_Training_Proximity-to-Failure_on_Skeletal_Muscle_Hypertrophy_A_Systematic_Review_with_Meta-analysis/22030796), [summary of Robinson et al.](https://biolayne.com/reps/issue-32/the-failure-factor-the-relationship-between-proximity-to-failure-and-strength-and-hypertrophy/)). This is where science and the old-schooler meet: sets must be truly hard, and failure is a tool and not a duty.
- **Drop sets.** Similar growth to conventional training in far less time, but from few and short studies ([Sødal et al., 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10390395/)). They suit a short session.
- **Supersets.** Save time; no proven extra growth, according to a secondhand summary of a review, and no dedicated meta-analysis was found. Use them when time is short.
- **Pyramid sets.** No evidence of an advantage, and one non-peer-reviewed review advises against them ([Brookbush](https://brookbushinstitute.com/courses/set-strategies-supersets-pyramid-sets-and-drop-sets)). The coach offers them for variety or because the rider likes them, and does not claim more.
- **Ramping sets.** The stepping stones up to the working weight, with sparse research on any effect ([BarBend](https://barbend.com/?p=167498)). Treat them as preparation, mainly before heavy compound lifts.
- **Widowmaker.** One set of 20 reps at about a 10-rep maximum, with pauses between reps once the first set of reps is done ([Lift Vault](https://liftvault.com/resources/widowmaker-sets/)). It is not an everyday tool, and it is rare and deliberate here. It is an old-school method with no dedicated evidence that the coach knows of, which it may say openly. The safety rule below applies: not on a lift where failing is dangerous without a spotter or safeties.
- **Breaks.** Early losses are largely neural and muscle comes back quickly on retraining ([review](https://www2.mdpi.com/2813-0413/1/1/1)). After a break the coach goes back a little without drama.
- **Progression.** The research did not produce a specific study on double progression (reps first, then weight). It is a chosen method and the coach does not present it as proven.

**In Hevy** (official schema of `POST /v1/routines`, checked on 2026-11-02): set types are `warmup`, `normal`, `failure` and `dropset`. Exercises have `superset_id`, `rest_seconds` and `notes`; sets have `weight_kg`, `reps` and `rep_range`; routines have `folder_id` and `notes`. So ramping sets become warmup sets, pyramids become differing weights, supersets use `superset_id`, and a widowmaker has no type of its own and goes into the exercise notes. This schema does not specify whether updating a routine keeps it in its folder; the builder verifies it.

## Limits

These limits are our own choice, not taken from research. They live in `src/coach/gym/limits.ts`.

| Limit | Value | Meaning |
| --- | --- | --- |
| RECENT_DAYS | 120 | An exercise counts as available if done within this time |
| LONG_BREAK_DAYS | 28 | Longer without an exercise: step back |
| MIN_COMPARABLE | 2 | Sessions of an exercise within 56 days needed before changing anything |
| STEP_BACK | 0.9 | Share of the last weight after a long break |
| MAX_STEP_PCT | 5 | Largest weight rise in percent, or 2.5 kg if that is more, rounded to 0.5 kg |
| REP_MIN / REP_MAX | 6 / 12 | Rep range of double progression |
| MAX_EXERCISES | 10 | Per workout |
| MAX_SETS | 30 | Per workout |
| MAX_FAILURE_SETS | 4 | Per workout |
| MAX_WIDOWMAKERS | 1 | Per workout |

## Progression rule

"All reps reached" means every normal or failure set at the heaviest weight of the last session did at least as many reps as the lowest such set of the session before, at the same or a lower weight. Warmup and drop sets are ignored. Then reps rise by one; at REP_MAX the weight rises and reps go back to REP_MIN. Bodyweight exercises only add reps.

Weighted exercises keep their suggested reps within REP_MIN to REP_MAX; bodyweight reps may exceed REP_MAX (more reps is the only progression there) but never fall below 1.

# Milestone L ledger

Plan: docs/superpowers/plans/2026-11-07-milestone-l-calm-ui.md
Branch: milestone-l-calm-ui
Before reviews: REVIEWS.md (copied here)

## Tasks
- T0 1039a35 web-shots tool, 37 shots.
- T1 baee715 kit (Row/Sheet/Switch/ChoiceRow/ConfirmLink), Profil/Login. Mac keeps prefs via showPrefs.
- T2 d0c266d Woche 11640px→1688px; chat sheet. Note for T8: several pins heavy (show one at a time?), 'denkt nach' bubble in seed.
- T3 257d333 Heute. For T4: Weitermachen on Heute should resume workout directly (no 2nd tap). User: deploy after everything (L+M), no push unless asked.
- T4 7a8703e live workout 2471→935 css px; summary was a shot-script bug. For T8: profile button overlaps workout header and sheets; check 'Training beenden' not hidden behind rest bar; exercise menu ~13 rows.
- T5 2840bae picker/routines/history. For T8: FIX kit Sheet swap bug (closing one sheet while opening another → async history.back closes the new one); routine save now needs ≥1 exercise; 'Sonstiges' labels remain.
- T6 e804ecf catalog+stats 3698→1688. For T8: progress.ts '(±0)', '~73 kg (+3,2)' wording; statistik title/Stand overlap.
- T7 aa9b33b Laufen/Essen, own items in household mealplan state record ('own' map, tombstones). Mac MealsView doesn't show own items.
- T8 package A: 0fae9a6 1260164 6629cd2 (sheet bug fixed, small sheets, PageHead, chat proposals strip).
- T8 package B: 8fc5d83 f8082b5 (Kraft). Note: prefill now carries previous set reps forward for planned sets with no reps (check in final review).
- T8 package C: db0282d 1c49862 bf51db5.
- smoke 77aec84. Merged.

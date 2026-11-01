# Mountain rides

A real climb as a large profile on the ride screen, ridden across several rides. It can be switched off during a ride with "Berg: an/aus" and never reaches the trainer or the recording.

- The profiles in `src/shared/passes-data.json` were generated once from BRouter routes on OpenStreetMap, with heights every 100 m, so no network is needed. Checked after generating: Alpe d'Huez 15.1 km and 1098 m, Mont Ventoux from Bédoin 21.4 km and 1590 m, Stelvio from Prato 25.1 km and 1843 m. The Brocken, Teide and Transfăgărășan routes come from start and end points chosen by us and may differ from the classic climbs.
- Your position is calculated from your power with round assumptions (83 kg, CdA 0.32). You do not feel the grade: the trainer keeps following the session. So the speed says nothing about fitness, and two riders are never compared by it.
- Position, choice and reached tops are stored in the coach state of each person. A mountain starts again after the top. These values do not make the coach replan.

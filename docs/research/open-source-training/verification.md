# Prüfnachweise zur Open-Source-Recherche

Datum: 06.11.2026. Alle personenbezogenen Trainingsdaten bleiben außerhalb dieser Forschungsunterlagen. Die hier verwendeten Lasten und Wiederholungen sind erfundene Eingaben zur Prüfung der Regeln.

## Quellbestand

Die fünf Repository-Archive wurden über GitHub auf den in [snapshots.json](snapshots.json) genannten Commit aufgelöst und anhand dieses Commits geladen. Die Quellstände liegen temporär unter `/private/tmp/pandafit-deep-review-20261106/`. Es gab keine Installation, keinen Appstart, keine fremden Package-Scripts und keine Datenbankmigration.

Die Quellverweise der vier Detailberichte wurden automatisch gegen den lokalen Snapshot geprüft: **241 Links mit festem Commit; alle referenzierten Dateien und Startzeilen vorhanden**. Das ist eine Referenzprüfung, keine zusätzliche inhaltliche Validierung jedes Satzes und kein HTTP-Test jedes Links.

## Heracles: 88 ausgewählte Originaltests

Die Tests wurden nach Prüfung ihrer Inhalte ausgeführt und anschließend vom Hauptagenten unabhängig erneut ausgeführt. Node v26.13.0, Permission-Modus, nur Lesezugriff auf den untersuchten Snapshot. Keine Netzwerkberechtigung und keine Schreibberechtigung innerhalb des Testprozesses.

Arbeitsverzeichnis: `/private/tmp/pandafit-deep-review-20261106/heracles`.

```sh
node --permission \
  --allow-fs-read=/private/tmp/pandafit-deep-review-20261106/heracles \
  --test --test-isolation=none \
  tests/set-model.test.mjs tests/analytics.test.mjs \
  tests/relative-e1rm.test.mjs tests/workout-recap.test.mjs \
  tests/preset-ordering.test.mjs
```

Ergebnis des unabhängigen Nachlaufs: **88 Tests, 88 bestanden, 0 fehlgeschlagen, 0 übersprungen, Exitcode 0.**

Das bestätigt nur die geprüften Softwareerwartungen. Andere Browser-, SQL-, Sync- und UI-Tests wurden nicht ausgeführt. Die Tests sind kein wissenschaftlicher Nachweis einer optimalen Trainingsplanung.

### Zusätzliche echte Funktionsaufrufe

`isAnalyticalWorkingSet()` und `calculateRirE1rmEstimates()` aus dem tatsächlichen `set-model.js` wurden mit folgenden Ergebnissen ausgeführt:

| Eingabe | Analytischer Arbeitssatz | e1RM-Ausgabe |
|---|---|---|
| 100 kg × 0, RIR 2 | true | null |
| 20 kg × 35, RIR 1 | true | Brzycki 360/720 kg; Epley 43,33/44 kg |
| 20 kg × 34, RIR 3 | true | Gesamtausgabe null |
| 40 kg × 12, RIR 3 | true | Vier Formelwerte |
| 40 kg × 12, RIR 4+ | false | null |

Diese Ergebnisse wurden auch vom Hauptagenten unabhängig reproduziert. Daraus folgt eine konkrete Grenze der Eingabe- und Formelvalidierung, nicht eine Behauptung über reale Nutzerleistungen.

## Cladiron: isolierte Swift-Minimalprobe

Die unabhängige Projektprüfung hat die relevanten Keywordlisten, Schleifen und nachfolgenden einfachen Bedingungen aus dem gelesenen Quelltext in eine minimale Swift-Datei übernommen. Diese Datei wurde zweimal, einschließlich eines Nachlaufs durch den Hauptagenten, ausgeführt. Es handelt sich **nicht** um den Import der vollständigen App-Engine.

```sh
swift -module-cache-path /private/tmp/pandafit-deep-review-20261106/swift-module-cache \
  /private/tmp/pandafit-deep-review-20261106/cladiron_row_probe.swift
```

Ergebnis, Exitcode 0:

```text
patterns=["horizontalPull", "locomotion"], isLowerBody=true,
isHard=false, moderateCardioDeferred=true
```

Die Quelltextprüfung hat separat belegt, dass die produktive Recovery-Aufrufkette genau diesen Namens-Fallback ohne die vorhandenen Datenbank-Muster-IDs verwendet. Das ist eine Kombination aus statischer Aufrufkettenprüfung und dynamischer Minimalprobe; keine vollständige Phone-/Watch-End-to-End-Prüfung.

## Liftosaur: zwei isolierte Originalmodule

Die gelesenen Module `src/models/equipmentLoadSolver.ts` und `src/utils/workoutStripReorder.ts` wurden mit dem bereits vorhandenen esbuild gebündelt; es gab keine Abhängigkeitsinstallation und keinen Appbuild. Die Ausgaben wurden aus den tatsächlich exportierten Funktionen berechnet.

| Prüfung | Beobachtetes Ergebnis |
|---|---|
| Stange 20 kg, Ziel 15 kg | 20 kg und `exact=false`; kein stiller exakter Treffer |
| Stange 20 kg, nur drei 10-kg-Scheiben, Ziel 60 kg | 40 kg mit einem Paar |
| Grundlast 0 kg, zwei 4-kg- und vier 3-kg-Scheiben, Ziel 12 kg | Je Seite zwei 3-kg-Scheiben, exakt |
| Erste von drei Übungen ans Ende verschieben, während zweite ausgewählt ist | Auswahl bleibt bei derselben Übung; erledigte/offene Sätze bleiben ihren Einträgen zugeordnet |

Die umfangreichen Mocha-/Browser-Testreihen des Projekts wurden nicht ausgeführt. Aus diesen vier Gegenproben folgt keine Vollvalidierung sämtlicher Geräte und Einheitenumrechnungen.

## PandaFit: echte Funktionen, erfundene Daten

Unter dem vorhandenen TypeScript-Loader wurden `suggestNext`, `recentLegWork` und die Zielbereichstabelle direkt aus dem unveränderten PandaFit-Code aufgerufen. Basiscommit siehe Snapshot-Liste.

| Prüfung | Ergebnis |
|---|---|
| 7,5 kg × 12 in zwei vergleichbaren Einheiten | 10 kg × 6, Grund `progress` |
| 20 kg × 8/9/10 in drei Einheiten, jeweils keine Wiederholung übrig | 18 kg × 10, Grund `step-back` |
| Zwei gleiche Übungseinträge in nur einer Einheit | Eine Wiederholung mehr, Grund `progress` |
| Ein Beineintrag mit ausschließlich Aufwärmsatz | `recentLegWork=true` |
| Summe der Untergrenzen für Muskelaufbau | 118 direkte Wochensätze |

Die Resultate bestätigen problematische Entscheidungsfälle im aktuellen Code. Sie sind keine bestandenen Abnahmetests für eine bereits korrigierte App. PandaFit-Produktcode wurde bei dieser Untersuchung nicht verändert.

## Repstack und Ironvellum

Statische Prüfung bis zu Datenzugriffen, Repository-Schreiboperationen und Testquellen. Keine ihrer vollständigen Testsuiten und keine Instrumentationstests wurden ausgeführt. Aussagen wie Ironvellums mögliche Laststeigerung bei 8/8/12 stammen aus nachverfolgten Bedingungen im Quelltext; sie wurden nicht auf Android reproduziert.

## Grenzen der gesamten Untersuchung

- Keine experimentelle Validierung einer App auf Muskelwachstum, individuelle Erholung oder optimale Trainingsdosis.
- Keine vollständige systematische Literaturübersicht und keine Prüfung jeder einzelnen Zelle aller Muskelkarten.
- Kein vollständiger Produktions-, Sicherheits-, Datenschutz- oder Lizenzrechtsaudit.
- Keine Aussage über aktuelle Store-Reife allein aus vorhandenen Tests oder README-Häkchen.
- Keine neuen Trainingsvorgaben für eine konkrete Person und keine Veränderung vorhandener Trainingsdaten.
- Erkenntnisse zur Wiederverwendung sind Vorschläge; konkrete Daten-/Code-/Assetübernahmen benötigen eine Entscheidung anhand ihrer jeweiligen Lizenz und Herkunft.

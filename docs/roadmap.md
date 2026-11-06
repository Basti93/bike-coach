# PandaFit Roadmap

Stand 06.11.2026. Diese Seite ersetzt die parallelen Listen „Auftrag 0–12“ (Konzept §19), „Schritte 0–8“ (Migrationsbewertung §5) und die Pakete im Grundlagenpapier als **einzige Arbeitsreihenfolge**. Die Dokumente bleiben fachliche Grundlage: [Konzept](superpowers/specs/2026-11-06-adaptive-training-coach-design.md), [Trainingswissenschaft](research/2026-11-06-training-science-foundation.md), [Migrationsbewertung](research/2026-11-06-migration-assessment.md).

## Leitsätze

- **Leicht und ruhig.** Zwei Gelegenheitsnutzer sollen ohne Einarbeitung zurechtkommen. Keine Gamification, keine Workout-Skriptsprache, keine Zahlenflut; lieber vier verständliche Zustände als zwanzig Dezimalwerte.
- **Ein Training geht nie verloren.** Protokollieren funktioniert ohne Netz und ohne KI.
- **Allgemeine Mechanismen statt Einzelfälle.** Werden Namen oder Sonderfälle aufgezählt, ist das ein Warnsignal. Muster: *KI schlägt vor → Person bestätigt → Ergebnis wird gespeichert → Code wendet es danach ohne KI an.*
- **Vorschlag, Bestätigen, Rückgängig.** Der Coach ändert nichts still. Jede Änderung hat einen Grund in einem Satz und lässt sich zurücknehmen.
- **Produktregeln im Code, Persönliches in der Datenbank.** Das Regelregister (`src/shared/training-policy/`) ist versioniert und geprüft; Ziele, eigene Regeln und Zuordnungen sind synchronisierte Records.

## Arbeitsweise

1. **Ein Meilenstein nach dem anderen.** Jeder Meilenstein ist im echten Training spürbar.
2. **Brief vor dem Bau:** Ziel in einem Satz, 3–5 Abnahmesätze aus Nutzersicht, was wegfällt, was nicht dazugehört. Die Person segnet den Brief ab.
3. **Plan nur für den nächsten Meilenstein.** Spätere bleiben grob, sie ändern sich durch das Gelernte.
4. **Rollen:** Die Person legt Ziel und Abnahme fest und probiert am Ende im Training aus. Claude (Opus) schreibt den Plan, überwacht und prüft jede Aufgabe gegen Plan und Abnahme. Ein günstigeres Modell (Sonnet) setzt die Aufgaben um.
5. **Parkplatz statt Abschweifen.** Was beim Bauen auffällt, aber die Abnahme nicht ändert, kommt unten in den Parkplatz. Am Meilensteinende wird entschieden.
6. **Tests nach Zweck.** Streng: Datenerhalt, Speicherung, Sync. Neu: nur die Abnahmesätze. Tests ersetzter Heuristiken werden mit ihrem Meilenstein gelöscht, nicht angepasst.
7. **Alte Wege entfernen.** Ein Meilenstein ist fertig, wenn der ersetzte Pfad weg ist oder ein Abbautermin feststeht.

## Meilensteine

| | Meilenstein | Spürbar daran, dass … | Ersetzt (alt) |
|---|---|---|---|
| ✅ | **0 Grundlage** | Regelregister existiert, Übungsidentität nur über ID/exakten Titel, unbekannte Muskeln sind sichtbar. | Auftrag 0, Schritt 0–1 (teilweise) |
| ✅ | **A Jede Übung ist richtig bekannt** | Jede gemachte oder importierte Übung hat Muskel, Gerät und passende Anleitung; Unbekanntes wird einmal per KI-Vorschlag eingeordnet. | Auftrag 1 |
| ✅ | **B Die Muskelbilanz stimmt** | Zusatzarbeit (z. B. Bizeps beim Rudern) zählt mit, Gesäß/Beinbeuger und Schulterteile sind getrennt; Anzeige in vier Zuständen statt Zahlenwand. | Auftrag 2 |
| **C** | **Gewichte passen zum Gerät** | Vorschläge sind am eigenen Gerät erreichbar; Progression pro Übung statt globaler 6–12/2,5 kg; RIR 0 wird nicht bestraft. | Auftrag 3–4 |
| **D** | **Coach-Änderungen sind sicher** | Vorschläge mit Grund, Bestätigen, Rückgängig; überlebt Schließen und Neustart; Coach sagt „geht nicht, weil …“ statt zu raten. | Auftrag 8, Teile 11 |
| **E** | **Meine Regeln und Ziele wirken** | „Künftig keine Kniebeugen“ wird als Regel vorgeschlagen, bestätigt, angezeigt und wirkt in jeder Planung; Löschen hebt die Wirkung auf. | Auftrag 5 |
| **F** | **Planung ist flexibel** | Feste Woche oder spontan, Kombination an einem Tag, Zeitrahmen; „was heute geht“ mit Grund in einem Satz. | Auftrag 6–7 |
| **G** | **Training ist veränderbar** | Reihenfolge ändern, beliebige Supersatz-Partner, Aufwärmen pro Bewegungsblock, Pausen aus einer Quelle. | Auftrag 9–10 |
| **H** | **Entwicklung über Wochen** | Befristete Schwerpunkte, Rückmeldung nach dem Training wirkt nachvollziehbar, Chat mit Datum/Zeit. | Auftrag 11–12 |

Die Reihenfolge folgt dem Nutzen: A–C machen die Kraftdaten verlässlich, D ist die Voraussetzung dafür, dass E–H dem Coach mehr erlauben.

## Vorbilder

Lokale Kopien in `~/Projects/pandafit-references/` (nicht im Repo). Übernommen werden Mechanismen, nie Stil oder Bedienkomplexität.

| Vorbild | Was wir nehmen | Für |
|---|---|---|
| GymCoach (MIT) | Muskelkarte mit vier Zuständen; Gewichte auf vorhandene Hanteln/Scheiben runden; KI-Antwort prüfen, Text bleibt bei Fehler sichtbar; Freitext „Bank 60 × 8, ging noch 2“ → bestätigter Satz | B, C, D, G |
| free-exercise-db (gemeinfrei, über GymCoach) | Größere Übungsbasis mit primären/sekundären Muskeln, Gerät und Bildern | A, B |
| Enduragent (MIT) | Änderungs-Vorschlag mit Version und Bestätigen; „unvollständig, weil …“; „was heute geht“ mit Grund; nur auf ausdrückliche Bitte verordnen; Claude-Abo-Schutz | D, F |
| Coach Watts (Apache 2.0) | Prüfen → einmal mit Fehlerhinweis neu versuchen → begrenzen; Regel-Gedächtnis getrennt vom Chat mit Bestätigung; „von KI geplant“-Markierung | D, E, F |
| Liftosaur | Geräteinkremente, begrenzter Scheibenbestand | C |
| Ironvellum | Aufwärmen pro Bewegungsblock, freie Supersatz-Partner | G |
| Heracles | Herkunft einer Muskelzuordnung (nur Modell, nicht die Zahlendarstellung) | B |
| Repstack | Befristete Blöcke, strukturierte Rückmeldung | H |

## Meilenstein A — Brief (umgesetzt 06.11.2026)

**Ziel:** Jede Übung, die ihr macht oder aus Hevy importiert, ist eine richtige PandaFit-Übung mit Muskel, Gerät und passender Anleitung.

**Abnahme:**
1. Taucht eine unbekannte Übung auf, schlägt der Coach einmal vor: „ist dieselbe wie X“ oder „neue Übung: Muskel, Gerät, kurze Anleitung“. Nach Bestätigen ist sie überall eine normale Übung: im Training, im Verlauf, in der Statistik und beim Coach – auch offline.
2. Ohne Netz oder KI bleibt die Übung voll nutzbar; der Muskel steht bis zur Einordnung auf „unbekannt“.
3. Eine falsche Einordnung lässt sich in einem Schritt korrigieren; alte Trainings bleiben erhalten und zählen danach richtig.
4. Die Übungsauswahl bietet eine größere, gemeinfreie Übungsbasis mit deutschen Namen und Bildern, wo vorhanden; Varianten mit anderem Gerät bekommen nie fremde Anleitungen.

**Fällt weg:** Hand gepflegte Zusatzeinträge für einzelne Hevy-Namen; die Sonderform „deutscher Titel + Gerät“, sobald gespeicherte Zuordnungen sie abdecken.

**Nicht dabei:** Wirkung sekundärer Muskeln auf Bilanz und Planung (kommt in B; die Daten werden aber schon mitgenommen), Geräteinventar (C).

**Entscheidungen der Person (06.11.2026):**
- Eine gemeinsame Übungsdatenbank für beide Profile; eine bestätigte Einordnung gilt für beide.
- Sehr eindeutige Vorschläge („Cable Curl“ = „Curl am Kabel“) werden ohne Rückfrage übernommen, mit Rückgängig.
- Basis ist free-exercise-db (gemeinfrei, Stand `f00c92c`, lokal in `~/Projects/pandafit-references/free-exercise-db`): 876 Übungen, 604 mit Nebenmuskeln, 1746 Bilder (~100 MB).

**Notizen für den Plan (noch nicht entschieden):**
- Records liegen heute pro Profil/Konto (`src/coach/server/household.ts`: „Each profile's records go to its own account's store“). Die gemeinsame Übungsdatenbank braucht deshalb einen Haushalts-Speicherort oder eine bewusste Spiegelung – das ist die erste Designfrage des Plans.
- Deutsche Namen für die Basis einmalig erzeugen und mitliefern (für die Suche); deutsche Kurzanleitung erst beim ersten Verwenden per KI erzeugen und speichern, statt 876 Anleitungen vorab zu übersetzen.
- Bilder nicht alle bündeln (Größe der PWA); zunächst nur für tatsächlich genutzte Übungen.
- Der KI-Vorschlag läuft auf der Coach-Seite (`coachHere`); Ergebnis ist eine gespeicherte Zuordnung, die UI, Statistik und Coach-Historie gleichermaßen verwenden.

## Meilenstein B — Brief (umgesetzt 06.11.2026)

**Ziel:** Die Muskelübersicht sagt pro Muskel in einem Wort, wo ihr steht – und rechnet die Arbeit mit, die andere Übungen nebenbei leisten.

**Abnahme:**
1. Rudern zählt auch für den Bizeps, Bankdrücken auch für Trizeps und vordere Schulter – als halbe Sätze (Regel `muscle.indirect-weight`). Das gilt für jede Übung im Katalog, auch für Basis- und KI-Übungen.
2. Gesäß und Oberschenkel hinten sowie Schulter vorn, seitlich und hinten sind getrennte Muskeln. Welche Übung welchen Teil trifft, steht in den Übungsdaten, nicht in Namenslisten.
3. Jeder Muskel steht in einem von vier Zuständen: **Noch nichts**, **Wenig**, **Im Ziel**, **Viel** (letzte 7 Tage gegen das Wochenziel der Person). Zahlen gibt es erst auf Antippen.
4. App, Statistik und Coach rechnen die Bilanz mit derselben Funktion; der Coach sieht dieselben Zustände.

**Fällt weg:** Titel-Regex und ID-Liste für Schulterteile; die Hauptanzeige „n von min–max Sätzen“; die zweite Volumenrechnung auf der Coach-Seite.

**Nicht dabei:** Körperbild/Muskelkarte (Parkplatz), persönliche Schwerpunkte (E/H), Gewichte und Geräte (C).

**Von Claude entschieden (Ledger):** Liste mit vier Zuständen statt Körperbild; Zielbereiche der neuen Teilmuskeln aus RP-Richtwerten im Regelregister; Altwert „Schultern“ ohne Teil zählt als „Schulter vorn“.

## Meilenstein C — Brief

**Ziel:** Jeder Gewichtsvorschlag lässt sich am Gerät im jeweiligen Studio wirklich einstellen, und jede Übung steigert sich in ihrem eigenen Bereich.

**Abnahme:**
1. Ein Training gehört zu einem Studio. Vor dem Training wird das Studio gewählt; Vorschlag ist das zuletzt genutzte. Dieselbe Übung hat pro Studio einen eigenen Gewichtsverlauf.
2. Die App lernt die Gewichtsstufen jeder Übung pro Studio aus den eingetragenen Gewichten (z. B. nur Vielfache von 5 → 5-kg-Stufen). Bei der Übung steht die gelernte Stufe; sie lässt sich in einem Schritt korrigieren. Vorschläge und die Prüfung der Coach-Pläne liegen immer auf einer erreichbaren Stufe.
3. Der Wiederholungsbereich kommt aus der Übung (Muskelgruppe im Regelregister) statt global 6–12. Der nächste Lastschritt ist die nächste erreichbare Stufe statt pauschal 2,5 kg / 5 %.
4. „Keine Wiederholung mehr übrig“ senkt das Gewicht nicht, solange die Leistung steigt oder hält. Abgesenkt wird nur bei echtem Leistungsrückgang oder nach langer Pause.
5. Bei Langhantel-Übungen zeigt die App die Auflage pro Seite (20-kg-Stange, übliche Scheiben) und sagt, wenn ein Gewicht nicht genau aufgelegt werden kann.

**Fällt weg:** Regeln `gym.rep-range`, `gym.min-step-kg`, `gym.max-step-pct`, `gym.effort-step-back-count`; das Runden auf 0,5 kg in der Progression.

**Nicht dabei:** eigenes Inventar pro Studio (Stangengewicht, begrenzte Scheiben, Hantelsätze), persönliche Wiederholungsbereiche (E), Aufwärmsätze aus dem Gerätemodell (G).

**Entscheidungen der Person (06.11.2026):** Stufen selbst lernen statt Einrichtung; mehrere Studios mit getrennten Verläufen; Scheibenrechner gehört in C.

## Parkplatz

- Export nach Hevy wählt bei zwei verknüpften Hevy-Vorlagen derselben Übung die zuerst gelistete (aus Review Meilenstein 0).
- Ohne Statistik-Record zählen manche deutschen Hevy-Varianten als „Sonstiges“ (löst sich mit A).
- Eigene Übung mit gleichem Titel wie eine eingebaute verliert gegen die eingebaute (löst sich mit A).
- Harmlose doppelte Titelformen wie „Seitheben am Kabel (Kabel)“.
- Zweitnamen „Dip“/„Single Arm Dumbbell Row“ prüfen, ob gewichtet/ungewichtet zusammenpasst.
- Aus Meilenstein A:
  - Bilder der Übungsbasis fehlen noch (nur für genutzte Übungen nachladen).
  - Eigene Seite „Übungskatalog“ zum Stöbern? (Heute nur über die Übungsauswahl.)
  - Chat-Coach und Mobilität kennen nur die eingebauten Übungen.
  - Englische Namen der Basis können Hevy-Titel ohne Vorschlag verknüpfen (heute keine Kollision).
  - Karte „Übungen einordnen“ zeigt doppelte Vorschläge, wenn zwei Coaches gleichzeitig fragen; Vorschläge mit gelöschtem Ziel bleiben unsichtbar und werden nie neu gefragt.
  - Rückgängig nach „Neue Übung bestätigen“ lässt die ungenutzte Übung im Katalog.
  - Einige übersetzte Anleitungen sind lang (>90 Wörter); wenige Originaltexte passen nicht zum Titel.
  - `src/shared/catalog.ts` importiert Muskelnamen aus `src/tracking/ui/labels` (Schichtung).
  - Eigene Übungs-Records: Muskel/Gerät/Typ werden nicht gegen die erlaubten Werte geprüft.
- Aus Meilenstein B:
  - Körperbild/Muskelkarte statt Liste? (Frage an die Person offen.)
  - Zielbereiche Gesäß + Oberschenkel hinten und Schulter seitlich + hinten summieren sich höher als früher; beobachten, ob der Coach dort zu viele Sätze plant.
  - Muskelpaare zählen halbe Sätze einer Übung auch auf der Gegenseite (Kniebeuge → Gesäß), das mildert den Ungleichgewichtshinweis.
  - Unbekannte Hevy-Übungen mit „Schultern“ zählen als Schulter vorn.
  - Coach erkennt Übungen über ID/Hevy-Verknüpfung, die Statistik zusätzlich über deutsche Titel; in seltenen Fällen leicht abweichende halbe Sätze.
- Aus Meilenstein C:
  - Coach plant immer fürs zuletzt genutzte Studio; wer vor dem Start ein anderes Studio wählt, bekommt Gewichte des alten Studios aus dem Plan.
  - Eigenes Inventar pro Studio (Stangengewicht, begrenzte Scheiben, Hantelsätze).
  - Gewichtsstufen und Studios werden nicht zwischen Profilen geteilt.

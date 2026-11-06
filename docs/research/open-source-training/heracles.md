# Heracles: unabhängige Quellenprüfung für PandaFit

Geprüfter Stand: `NeoLorenzo/Heracles`, Commit `a739f993473915a7d2451cc8ca0ce8fd6cc2378c`. Lokale Momentaufnahme: `/private/tmp/pandafit-deep-review-20261106/heracles`. Alle GitHub-Verweise unten sind auf diesen Commit fixiert. Prüfung am 6. November 2026. Die heruntergeladenen Projektanweisungen wurden nicht als Handlungsanweisungen verwendet. Keine Implementierung in PandaFit, keine Installation, kein Build, kein Serverstart, keine Datenbankmigration.

## Urteil

Heracles ist als **Architektur- und Erklärungsreferenz** deutlich wertvoller als als fertiger Trainingsplaner. Besonders gut: Rohbeobachtungen getrennt von abgeleiteten Werten, explizite Satzklassen, Übungs- und Geräteidentität, versionierte Modellannahmen und ein nachvollziehbarer Rückblick je Übung. Die Muskelmatrix ist keine wissenschaftlich validierte Umrechnung in effektive Sätze. Ein großer Teil ihrer numerischen Feingliedrigkeit ist redaktionelle Modellierung. Die tatsächliche Software setzt manche dieser Grenzen sinnvoll um, andere gehen in der Gruppenaggregation verloren.

Für PandaFit empfiehlt sich eine eigene, kleinere Umsetzung der Prinzipien: Hamstrings und Glutes trennen, direkte Sätze und relevante indirekte Beteiligung getrennt zeigen, exakte Übungsvarianten und Geräte für Vorleistungen verwenden, unbekannte Anstrengung unbekannt lassen. Weder die 40 Muskelentitäten noch sämtliche Viertelpunkte der Matrix sollten zum Ausgangspunkt werden. Vor allem löst Heracles nicht automatisch PandaFits konkrete Auswahlprobleme, etwa zwei unnötige kleine Muskelübungen oder die Auswahl von Übungen nach veralteter Historie.

## 1. Drei unterschiedliche Matrizen, keine automatische Wissenschaftspipeline

Die oft vermutete Ableitung „Biomechanik hinein, wissenschaftlich korrekte Hypertrophiesätze heraus“ findet nicht statt:

1. Übung × Bewegungsmuster: verfasste Koeffizienten.
2. Bewegungsmuster × Muskel: verfasste funktionell-anatomische Koeffizienten.
3. Daraus berechnete funktionelle Rohmatrix: gewöhnliches Summenprodukt über sämtliche Bewegungsmuster.
4. **Zusätzliche, separat verfasste** Übung × Muskel-Relevanzmatrix: eigenständige Auswahl in den Stufen `0 / 0.25 / 0.50 / 0.75 / 1.00`.

Das Python-Skript multipliziert jede Übungs-Muster-Komponente mit der jeweiligen Muster-Muskel-Komponente und summiert alle Pfade, ohne Normalisierung oder Kappung. Es speichert zusätzlich die Zahl positiver Pfade. [scripts/derive_exercise_muscle_matrix.py:49–109](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/scripts/derive_exercise_muscle_matrix.py#L49-L109).

Ich habe die beiden CSVs unabhängig mit eigener Python-Standardbibliotheksrechnung multipliziert: **138 × 40 = 5.520 Zellen, 1.152 positive Zellen, 91 Werte über 1, Maximum 2,0**. Das entspricht den dokumentierten Angaben. Mehrere korrelierte Pfade können denselben Muskel mehrfach zählen; die Dokumentation benennt diese Grenze ausdrücklich. [docs/EXERCISE_MUSCLE_COMPOSITION.md:24–72](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/EXERCISE_MUSCLE_COMPOSITION.md#L24-L72).

**Wichtige Entlastung:** Die Dashboard-Muskelwerte verwenden diese über 1 hinausgehende Rohmatrix gerade nicht. `ensureExerciseMuscleLookup()` lädt die aktuelle `exercise_muscle_relevance_versions` und deren `exercise_muscle_relevance_coefficients`. [app.js:1492–1545](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/app.js#L1492-L1545). Die Gefahr der biologischen Doppelzählung der Rohmatrix ist deshalb kein belegter Dashboard-Bug.

**PandaFit:** Die rohe Matrixmultiplikation verwerfen. Eine kompakte, einzeln überprüfte Übung-Muskel-Zuordnung reicht für die vorhandenen Probleme.

## 2. Die endgültigen Koeffizienten sind authored data, keine aus Studien geschätzten Parameter

Der Relevanz-Importer prüft Form, Achsen, Eindeutigkeit und die fünf erlaubten Koeffizienten; er berechnet die Relevanzwerte nicht aus Trainingsstudien oder aus der Rohmatrix. [scripts/prepare_exercise_muscle_relevance_import.py:15–106](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/scripts/prepare_exercise_muscle_relevance_import.py#L15-L106). Die Dokumentation beschreibt einen übungsweisen Audit anhand von Gelenkposition, Muskellänge, biartikulären Effekten, Unterstützung, Widerstandsgeometrie und ausgewählter Langzeitevidenz. [docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md:11–41](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md#L11-L41).

Die ursprüngliche CSV enthält unabhängig nachgezählt 138 Übungen, 40 Muskeln und **723 positive Zellen**. Die aktuelle kanonische CSV enthält **116 Übungen, 4.640 Zellen und 577 positive Zellen**. Die Versionshistorie erklärt den Rückgang: Geräte wurden aus der Übungsidentität entfernt, Quellzeilen zusammengeführt. Die Zahlen „138 Übungen“ und „116 Übungen“ beziehen sich auf unterschiedliche veröffentlichte Stände; sie sind nicht per se ein Widerspruch. [docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md:100–123](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md#L100-L123).

Die Datenbank speichert Version, Quelldatei- und Dokumenthash, Zellenzahl und globalen Koeffizientenvertrag. Die Relevanzzelle selbst enthält dagegen im Wesentlichen Versions-, Übungs-, Muskel-ID und den Wert, **keinen individuellen Studienbeleg, keine populationsspezifische Unsicherheit und keine quantitativ geschätzte Effektverteilung**. [supabase/migrations/20260810203718_add_exercise_muscle_hypertrophic_relevance.sql:139–149](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/supabase/migrations/20260810203718_add_exercise_muscle_hypertrophic_relevance.sql#L139-L149).

Versionsprovenienz ist gut und übernehmbar. Sie beweist Reproduzierbarkeit und Herkunft der Datei, nicht die biologische Genauigkeit jeder Zelle.

## 3. Die Literatur ist nicht bloß EMG; die konkrete Kalibrierung bleibt trotzdem heuristisch

Die Relevanzdokumentation nennt acht Arbeiten ausdrücklich als longitudinale Kalibrierungsgrundlagen, darunter seated/prone leg curl, overhead/neutral triceps extension, stehendes/sitzendes Wadenheben, Squat-Tiefe und Squat/Hip-Thrust. [docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md:66–90](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md#L66-L90).

Stichproben gegen Primärquellen bestätigen echte Trainingsinterventionen: Maeo zum Beinbeuger verglich über zwölf Wochen sitzendes und liegendes Training mit MRT-Muskelvolumen; die größere Anpassung der biartikulären Hamstrings ist ein chronisches Ergebnis. Maeo zum Trizeps untersuchte ebenfalls zwölf Wochen und MRT-Muskelvolumen. Auch die Wadenarbeit vergleicht zwölf Wochen Training mit bildgebender Volumenmessung. Das ist qualitativ etwas anderes als eine akute EMG-Rangliste. [Maeo, Hamstrings](https://pubmed.ncbi.nlm.nih.gov/33009197/), [Maeo, Trizeps](https://pubmed.ncbi.nlm.nih.gov/35819335/), [Kinoshita, Waden](https://pubmed.ncbi.nlm.nih.gov/38156065/).

Das Studienauswahlprotokoll schließt akutes EMG ausdrücklich aus dem Pool chronischer Hypertrophieergebnisse aus. Es enthält aber noch markierte, nicht aufgelöste Zitationsplatzhalter; sein Umfang allein ist kein Nachweis einer vollständig durchgeführten systematischen Bewertung. [docs/RESISTANCE_TRAINING_OUTCOME_STUDY_SELECTION_PROTOCOL.md:20–53](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/RESISTANCE_TRAINING_OUTCOME_STUDY_SELECTION_PROTOCOL.md#L20-L53). Die Taxonomie nutzt teilweise anatomische Plausibilität und akute Aktivierungsforschung zur Begründung von Unterteilungen, kennzeichnet deren Grenzen aber ebenfalls. [docs/MUSCLE_GROUP_TAXONOMY.md:147–178](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/MUSCLE_GROUP_TAXONOMY.md#L147-L178).

Die Studien rechtfertigen nicht automatisch die genauen Zahlen der CSV. Konkretes Beispiel: Im Originaldatensatz hat der kurze Bizeps-femoris-Kopf beim prone curl `1.0`, beim seated curl `0.75`, obwohl die zitierte Maeo-Arbeit gerade keinen Unterschied der Hypertrophie des monoartikulären Muskels zwischen den Bedingungen berichtet. Das ist kein Beweis, dass die Zuordnung falsch ist; es zeigt, dass `0.75` kein aus diesem Versuch abgelesener Effektfaktor ist. [Original-CSV:60–63](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.csv#L60-L63), [Studie](https://pubmed.ncbi.nlm.nih.gov/33009197/).

**PandaFit:** Richtung und vorsichtige Differenzierungen übernehmen; Viertelpunkte nicht als experimentell validierte „effektive Satzäquivalente“ ausgeben. Für jede relevante Modellentscheidung eine kurze eigene Begründung und Evidenzstatus vorsehen.

## 4. Die Gruppenaggregation verhindert anatomisches Aufsummieren, verliert jedoch entscheidende Unterschiede

`calculateMuscleExposure()` addiert je Muskel dessen Relevanz. Für eine UI-Muskelgruppe nimmt es pro Satz aber **das Maximum** ihrer Kinder und zählt den Satz höchstens einmal als Rohsatz dieser Gruppe. `calculateExerciseSources()` verwendet denselben Maximalwert. [analytics.js:125–173](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/analytics.js#L125-L173).

Das ist eine sinnvolle Sicherung: Ein Satz Bankdrücken wird nicht allein wegen zwei Pectoralis-Regionen als 1,75 Brustsätze summiert. Ein Verbundsatz darf gleichzeitig Brust-, Schulter- und Trizepsbeteiligung haben; diese Gruppenwerte sind unabhängige Dimensionen. Die Tests prüfen beide Eigenschaften ausdrücklich. [tests/analytics.test.mjs:83–100](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/tests/analytics.test.mjs#L83-L100).

Der Preis: Sowohl prone als auch seated curl ergeben auf Hamstrings-Gruppenebene `1.0`, weil jeweils mindestens ein Kopf `1.0` erhält. Pushdown und Overhead-Trizepsextension ergeben beide Trizeps `1.0`, obwohl die Kopfverteilung anders ist. Die zusätzliche anatomische Auflösung wirkt erst in der aufgeklappten Muskelansicht. [Kanonische CSV:21–23,54–57,88–92](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE_CANONICAL.csv#L21-L92), [features/dashboard.js:252–292](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/features/dashboard.js#L252-L292).

Die UI nennt diese Größen tatsächlich „weighted sets“ und zeigt Dezimalwerte. Die Dokumentation warnt gleichzeitig davor, sie als gemessenen Reiz oder effektive Sätze zu lesen. [features/dashboard.js:263–282](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/features/dashboard.js#L263-L282), [docs/CURRENT_LIMITATIONS_OF_MUSCLE_GROUP_MAPPING.md:112–122](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/CURRENT_LIMITATIONS_OF_MUSCLE_GROUP_MAPPING.md#L112-L122).

**PandaFit:** Eine grobe Gruppenansicht ist ausreichend, solange sie die unterschiedlichen Aufgaben von Hamstrings, Glutes und Quads erhält. Keine Summe über Unterköpfe bilden; Detailauflösung nur einführen, wenn sie eine konkrete Auswahlentscheidung verbessert. Direkte und indirekte Beteiligung separat verständlich machen.

## 5. RIR ist eine binäre Eingangsschranke für Muskelvolumen

`isCompletedSet()` verlangt bei Nicht-Warmups RIR in `0–4`. `isWorkingSet()` schließt Warmups und den Bucket `4` aus. Analytisch zählt nur die Kombination beider Bedingungen. Der gespeicherte Wert `4` bedeutet `4+`. [set-model.js:18–56](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/set-model.js#L18-L56).

Für die Muskelbelastung wird innerhalb RIR 0–3 kein weiterer Anstrengungsfaktor verwendet: Ein Satz bei RIR 0 und derselbe bei RIR 3 erhalten dieselben Matrixwerte. Bei RIR 4+ fällt der Satz vollständig aus dieser Analyse. Ein ansonsten identischer Dreiersatzblock springt daher von drei gezählten auf null gezählte Sätze, wenn die Angabe von 3 auf 4+ wechselt. Die Dokumentation nennt das zutreffend eine Produktregel, keine biologische Nullwirkung. [analytics.js:133–155](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/analytics.js#L133-L155), [docs/DESIGN_RULES.md:26–30](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/DESIGN_RULES.md#L26-L30).

Fehlender RIR wird im aktuellen Code **nicht** still als 0 interpretiert: Ein normaler vollständiger Satz mit `reported_rir_bucket:null` ist Draft, nicht analytisch. Neue Preset-Plätze werden aktuell mit leeren Last-, Wiederholungs- und RIR-Feldern angelegt. Eine ältere Migration legte ursprünglich RIR0-Platzhalter an; die spätere Implementierung ersetzt das. [supabase/migrations/20260824180000_implement_live_workout_equipment_and_session_flow.sql:102–116,292–303](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/supabase/migrations/20260824180000_implement_live_workout_equipment_and_session_flow.sql#L102-L116), [aktuelle Startfunktion:298–307](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/supabase/migrations/20261018120000_order_preset_workouts.sql#L298-L307).

**PandaFit:** Rohsatz, Warmup-Markierung, RIR/RPE und Modellinklusion als unterschiedliche Felder behandeln. Unbekannter RIR darf vorhandene Trainingseinträge nicht verschwinden lassen. „Harte Sätze mit bekanntem RIR“ kann eine zusätzliche Ansicht sein, nicht die einzige Wahrheit.

## 6. Historischer Backfill erzeugt scheinbar gemeldeten RIR0 und beeinflusst die Analyse

Die RIR-Migration setzt **alle vorhandenen Nicht-Warmups auf RIR0**, mit `rir_source:'historical_backfill'`. Das ist nachprüfbare Datenmigration, keine Beobachtung. [supabase/migrations/20260820190518_implement_rir_set_model.sql:3–9](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/supabase/migrations/20260820190518_implement_rir_set_model.sql#L3-L9).

Die Provenienz bleibt gespeichert und wird auch geladen. Die eigentliche Satzklassifikation, Muskelaggregation und e1RM-Rechnung unterscheiden aber nicht nach `rir_source`. Ein historisch geschätztes RIR0 gilt damit genauso als harter Arbeitssatz wie ein tatsächlich eingegebenes RIR0; seine adjustierten e1RM-Werte sind deckungsgleich mit den beobachteten Formeln. [set-model.js:50–95](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/set-model.js#L50-L95).

Auch die normale Historienanzeige verwendet `formatSetClassification(set)` und zeigt `0 RIR · Working set`. Im Dashboard steht für die Historienzeile `RIR ${record.reported_rir_bucket}`, im Tooltip sogar „Reported RIR“. Beide Stellen zeigen die Herkunft nicht an. [app.js:1603–1615](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/app.js#L1603-L1615), [features/dashboard.js:455–460](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/features/dashboard.js#L455-L460), [features/dashboard.js:595–600](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/features/dashboard.js#L595-L600).

**Das ist mehr als ein Labelproblem:** Der Backfill verändert analytische Einschlusskriterien und suggeriert bei historischen Daten einen Wissensstand über Anstrengung, der nicht vorlag. Positive Seite: Die Herkunft wurde nicht zerstört; ein späterer Fix könnte sie weiterverwenden. **PandaFit: nicht übernehmen.** Historische RIRs unbekannt lassen und Fortschritt/Last/Wiederholungen weiterhin auswerten, ohne sie zu Versagenssätzen umzudeuten.

## 7. Nachgewiesene Validierungslücken: null sauber, undefined und null Wiederholungen nicht

Gezielte Ausführung der reinen Funktionen ergab:

| Eingabe | `isCompletedSet` | `isAnalyticalWorkingSet` | e1RM |
|---|---:|---:|---|
| `100 kg × 8`, RIR fehlt (`null`) | false | false | null |
| `100 kg × 8`, RIR3 | true | true | vier Werte |
| `100 kg × 8`, RIR4+ | true | false | null |
| `100 kg × 0`, RIR2 | **true** | **true** | null |
| Last/Wdh fehlen als `undefined`, RIR2 | **true** | **true** | null |
| Last/Wdh beide leere Strings, RIR2 | **true** | **true** | null |

Grund: Der Code lehnt nur explizite `null`-Werte am Anfang ab, überspringt die Zahlenprüfung bei `undefined` und akzeptiert Wiederholungen ab 0. Leere Strings werden mit `Number('')` zu 0. [set-model.js:18–36](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/set-model.js#L18-L36).

Die `undefined`-Fälle sind in regulären Supabase-Abfragen mit ausgewählten Spalten weniger wahrscheinlich; ich behaupte keinen belegten Verlust realer Daten. Der echte Null-Wiederholungsfall bleibt aber im SQL-Modell ebenfalls zugelassen (`reps >= 0`), und die Abschlussprüfung prüft Vollständigkeit, nicht `reps > 0`. [supabase/bootstrap/current_baseline.sql:1423](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/supabase/bootstrap/current_baseline.sql#L1423), [Abschlussprüfung:396–415](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/supabase/migrations/20260824180000_implement_live_workout_equipment_and_session_flow.sql#L396-L415).

Die vorhandenen Tests prüfen null-Drafts und normale RIR-Klassen, aber nicht diese Randfälle. Einige Testdatensätze lassen Last und Wdh absichtlich weg und behandeln den Satz trotzdem als analytisch gültig. [tests/set-model.test.mjs:24–55](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/tests/set-model.test.mjs#L24-L55), [tests/analytics.test.mjs:52–59](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/tests/analytics.test.mjs#L52-L59).

**PandaFit:** Fehlversuche/0-Wdh bei Bedarf als eigene Beobachtung speichern, aber nicht als durchgeführten Hypertrophiesatz zählen; funktionale Validatoren streng und einheitlich halten.

## 8. e1RM: nachvollziehbare Formeln, keine empirisch geschätzte Unsicherheit

Heracles rechnet Brzycki `Last × 36 / (37 − Wdh)` und Epley `Last × (1 + Wdh/30)`. Es berechnet beide Formeln einmal mit tatsächlich absolvierten Wdh und einmal mit `Wdh + reported RIR`. Die Ausgabe ist auf zwei Dezimalstellen gerundet. [set-model.js:72–95](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/set-model.js#L72-L95).

Bei `100 kg × 8, RIR2` sind die beobachteten Werte `124.14 / 126.67 kg`, die adjustierten `133.33 / 133.33 kg`. Das System gibt keinen Mittelwert als Wahrheit aus. Die Dokumentation stellt ausdrücklich klar: Die Spannweite ist **kein Konfidenzintervall**, kein gemessenes 1RM und kein aus Literatur abgeleitetes Modell des wahren RIR. Die Chart-Beschreibung benennt die Formelstreuung ebenfalls korrekt. [docs/DESIGN_RULES.md:70](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/DESIGN_RULES.md#L70), [features/dashboard.js:618](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/features/dashboard.js#L618).

Problematisch ist die Domäne: Brzycki wird formal bis 36 Wiederholungen verwendet; das ist ein Rechenbereich, keine nachgewiesene Genauigkeitsgrenze. Eigene Randfallausführung: `20 kg × 35, RIR1` ergibt Brzycki beobachtet **360 kg**, adjustiert **720 kg**, gegenüber Epley `43.33/44 kg`. Bei `20 kg × 34, RIR3` wird der gesamte Viererwert null, weil `34+3` die Brzycki-Domäne überschreitet, obwohl beide beobachteten Formeln und Epley adjustiert noch berechenbar sind. Der Code koppelt alle vier Werte mittels `some(value===null)` zusammen. [set-model.js:75–94](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/set-model.js#L75-L94).

**PandaFit:** Rohleistung zuerst anzeigen; e1RM optional und bei hohen Wiederholungen zurückhaltend. Fehlende Gültigkeit einer Formel sollte andere verfügbare Messgrößen nicht entfernen. Eine kleine Streuung zweier Formeln ist kein zuverlässiger Unsicherheitsbereich.

## 9. Gute repräsentative Satzwahl; „Progression“ ist überwiegend Rückschau

Der repräsentative Satz wird je Session und Geräteserie anhand der beobachteten Formeln gewählt: größeres Minimum aus Brzycki/Epley, dann größeres Maximum, dann Last und Wdh. Die subjektive RIR-Angabe kann den Satzrang nicht durch die Adjustierung erhöhen. [analytics.js:219–272](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/analytics.js#L219-L272).

Der Rückblick vergleicht den kleineren beobachteten Formelwert des repräsentativen Satzes mit der letzten passenden abgeschlossenen Session. „Neuer Bestwert“ und „besser als zuletzt“ sind getrennte Ergebnisse. Unter 1 % Veränderung wird „Similar“ angezeigt; das ist im Code ausdrücklich eine Produktdarstellungsregel, keine wissenschaftlich validierte minimal nachweisbare Änderung. [workout-recap.js:9–36,57–61](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/workout-recap.js#L9-L61), [workout-recap.js:165–210](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/workout-recap.js#L165-L210).

In diesen Modulen gibt es keinen progressionsgesteuerten Satzplan, keine nächste Last aus individueller Reaktionsschätzung, kein Ermüdungsmodell und keinen kausalen Nachweis von Muskelwachstum. „Progression“ meint hier primär vergleichbare Leistungsanzeige. Eine einzelne gute Tagesleistung kann den repräsentativen Satz und Rekord bestimmen; Arbeitskapazität der übrigen Sätze ist damit nicht beschrieben.

**PandaFit:** Vergleichbare Vorleistung, letzter Wert, bisheriger Bestwert und Trend sind sinnvolle eigene Anzeigen. Keine automatische Trainingsvorgabe allein aus dem Maximum eines Tages ableiten.

## 10. Geräte- und Übungsidentität: starkes Grundmodell, bewusst verlorene Unterschiede

Geräte sind eigene besitzerbezogene Identitäten, Gyms nur Verfügbarkeitsmetadaten. Generische Hanteln/Bodyweight werden standortübergreifend wiederverwendet, unbekannte Maschinenmodelle haben Platzhalter. [supabase/migrations/20261017130000_canonical_equipment_identity.sql:45–89](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/supabase/migrations/20261017130000_canonical_equipment_identity.sql#L45-L89). Zwei gleich benannte Geräte mit unterschiedlicher ID bleiben in der Analytik getrennte Serien; Kurzhantellasten werden pro Hantel behandelt. [tests/analytics.test.mjs:73–80](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/tests/analytics.test.mjs#L73-L80), [set-model.js:98–102](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/set-model.js#L98-L102).

Wichtig: Die kanonische Übung erbt dennoch **eine einzige Relevanzzeile** von einer ausgewählten Quellübung. Das gewählte Gerät ändert die Muskelzuordnung nicht. Bei `Chest Press` wird die Barbell-Zeile gewählt; die zuvor modellierte Kabel-Protraktion und Serratus-Relevanz `0.25` werden bewusst verworfen. Das ist sogar im Entscheidungsprotokoll beschrieben. [docs/scientific/issue-22-canonical-exercise-identity.json:5–16,43–44](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/scientific/issue-22-canonical-exercise-identity.json#L5-L44).

Das ist kein versteckter Rechenfehler, sondern eine Vereinfachungsentscheidung. Sie widerspricht aber der Vorstellung, der aktuelle Code berücksichtige jede dokumentierte gerätespezifische Widerstandsgeometrie. Die Lookup-Funktion erhält allein `exercise_id`, nicht Übung plus Gerätegeometrie. Historische Session-Übungen werden auf aktive kanonische IDs umgebogen; alte Modellzeilen bleiben vorhanden, die aktuelle UI berechnet Historie aber mit der aktuellen Version. Historische Modellanzeige und historische Rohbeobachtung sind daher getrennt zu beurteilen. [app.js:1514–1542](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/app.js#L1514-L1542), [supabase/migrations/20261017130100_canonical_exercise_identity.sql:898–909](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/supabase/migrations/20261017130100_canonical_exercise_identity.sql#L898-L909).

**PandaFit:** Stabile IDs und getrennte Geräte übernehmen. Varianten, die Zielmuskeln, Unterstützung, ROM oder Ausführung relevant ändern, als Varianten erhalten. Reines String-Matching oder pauschales Zusammenführen von „ähnlichen“ Namen vermeiden.

## 11. Vorleistungsvergleich ist nicht überall gleich streng, keine Frischeprüfung

Der Recap verwendet bei bekanntem Gerät `exerciseId + canonicalEquipmentId`, standortübergreifend. Ohne Gerät nutzt er `exerciseId + equipment-unrecorded + gymId` und vergleicht nur mit ebenfalls unbekanntem Gerät im selben Gym. [workout-recap.js:39–46](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/workout-recap.js#L39-L46).

Die Live-Vorleistung ist lockerer: Ist `equipmentId` null, filtert die Query nur das Gym. Es fehlt der Filter `canonical_equipment_id IS NULL`; auch die nachgelagerte Auswahl akzeptiert dann jedes Gerät. Die letzte Leistung auf irgendeiner Maschine desselben Gyms kann erscheinen. Das ist mit einem Test sogar ausdrücklich festgeschrieben: „No equipment ID retains the existing unrestricted matching behavior“. [features/session/session-history-context.js:126–165](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/features/session/session-history-context.js#L126-L165), [tests/live-session-flow.test.mjs:360–373](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/tests/live-session-flow.test.mjs#L360-L373).

Der gleiche Lookup sortiert ordentlich nach Trainingstag, Erstellung und ID, schließt die aktuelle Session aus und verwendet einen nach ausgeschlossener Session differenzierten Cache-Key. Das adressiert einen alten A→B→C-Veraltungsfehler; die vorhandenen Tests prüfen ihn. [features/session/session-history-context.js:80–97,134–142](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/features/session/session-history-context.js#L80-L142), [tests/live-session-flow.test.mjs:318–357](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/tests/live-session-flow.test.mjs#L318-L357).

**Kein Frischemodell:** Die Query und der Recap verlangen keine maximale Zeitspanne. Ein mehrere Monate alter passender Eintrag bleibt der Vergleich. Das Datum wird angezeigt, aber kein Trainingspausenabschlag berechnet. Das ist als Trainingsbuch vertretbar; PandaFit sollte es nicht als aktuelle Belastbarkeit missverstehen.

**PandaFit:** Einen gemeinsamen Vergleichbarkeitsvertrag für alle Ansichten schaffen: gleiche Übungsvariante, gleiche Lastkonvention, vergleichbares Gerät; unbekanntes Gerät nicht still zu bekanntem Gerät matchen. „Letzte passende Leistung vor X Tagen“ anzeigen. Eine optionale Wiedereinstiegsempfehlung nach längerer Pause benötigt eine eigene begründete Regel.

## 12. Der vorhandene Planungsalgorithmus sortiert Übungen, er optimiert nicht den Trainingsumfang

`planPresetExerciseOrder()` setzt ein bestehendes Preset deterministisch in Reihenfolge: Rotation aus der tatsächlich absolvierten Reihenfolge, optionale Prioritätsgruppen, optionales Alternieren der Hauptmuskelgruppen. Hauptgruppen entstehen ab Relevanz `0.75`; bei Gleichstand entscheidet die Katalogreihenfolge. Der Algorithmus nimmt pro Übung nur eine Gruppe für die Reihenfolge, obwohl Verbundübungen Nebenmuskeln trainieren. [preset-ordering.js:19–21,55–75,89–130,176–207](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/preset-ordering.js#L19-L207).

Das ist tatsächlich implementiert und getestet, aber kein Generator für bedarfsgerechte Übungsauswahl. Er entfernt keine redundanten kleinen Muskelübungen, reduziert nicht automatisch Armvolumen nach viel Drücken/Ziehen und erkennt keine physiologische Erholung. Die Dokumentation nennt die Funktion ausdrücklich eine Produktentscheidung zur Reihenfolge und erklärt, dass alternierende Hauptgruppen Überlappung nicht beseitigen. [docs/PRESET_EXERCISE_ORDER.md:9–16,30–39](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/docs/PRESET_EXERCISE_ORDER.md#L9-L39).

**PandaFit:** Als erklärbares Ordnungsprinzip adaptieren, falls relevant. Für das konkrete Problem „zwei kleine Muskelübungen“ muss die Auswahl vorher gegen schon vorhandene direkte und indirekte Wochenbeteiligung geprüft werden. Reihenfolge allein repariert die Auswahl nicht.

## Konkrete Übernahmeempfehlung und kleinstes sinnvolles PandaFit-Modell

| Bereich | Entscheidung | Konkreter Nutzen / Grenze |
|---|---|---|
| Rohsätze unverändert speichern, Schätzwerte getrennt | Übernehmen | Fehlerkorrektur und spätere Neuberechnung ohne Verlust der Beobachtung |
| Explizit Warmup, Satzstatus und optionale Anstrengung speichern | Übernehmen | Saubere Trennung statt impliziter Ausschlüsse |
| Stabile Übungs-, Varianten- und Geräte-IDs | Übernehmen | Verhindert die bestehenden falschen Variantenmatches |
| Versions-ID, Begründung, Quelle/Evidenzstatus für Zuordnungen | Übernehmen | Nachvollziehbare Modelländerungen |
| Relevante indirekte Arbeit zusätzlich zu direkten Sätzen | Adaptieren | Bankdrücken liefert Arm-/Schulterbeteiligung; diese ist sichtbar, aber kein experimentell exaktes Äquivalent |
| Gemeinsames Hamstrings/Glutes-Feld | Auflösen | Hip thrust ist kein Ersatz für Kniebeugung; RDL und Leg curl decken andere Aufgaben ab |
| 40 Muskeln mit sämtlichen Köpfen und Viertelpunkten | Zunächst verwerfen | Hoher Pflegeaufwand; mehr Zellen als gesicherte Entscheidungen |
| Summenprodukt-Rohmatrix als Satzäquivalent | Verwerfen | Korrelierte Pfade und Werte >1 ohne biologische Kalibrierung |
| Historische unbekannte RIR als 0 | Verwerfen | Erfindet Anstrengungsbeobachtungen und verzerrt Einschluss |
| Automatische harte RIR3/4-Grenze für die einzige Volumenansicht | Verwerfen | Künstliche Diskontinuität und Verlust unbekannter Historie |
| e1RM/Formelstreuung | Optional adaptieren | Ergänzung zu Rohleistung; kein Präzisions- oder Bereitschaftsmaß |
| Alter beliebiger Vorleistung als aktuelle Vorgabe | Verwerfen | Vergleich braucht Datum und Pause-Kontext |

Ein angemessen kleiner erster Datenvertrag wäre:

1. **Beobachtung:** Datum, Session-ID, exakte Übungsvariante, Geräte-ID/Unbekannt, Lastkonvention, Last, Wdh, Satztyp, optional RIR/RPE mit Herkunft.
2. **Muskelzuordnung:** wenige nutzerrelevante Gruppen; mindestens Glutes und Hamstrings getrennt. Pro Übungsvariante `direkt`, `relevanter Nebenmuskel` oder `keine sinnvolle Zuordnung`; Modellversion und Begründung. Keine automatische Aufteilung in 40 Entitäten.
3. **Wochenanzeige:** direkte abgeschlossene Arbeitssätze, daneben indirekte Beteiligung und Zahl der Sätze mit unbekannter Anstrengung. Falls später eine gewichtete Summe ergänzt wird, als modellierte Zusatzansicht mit erklärten Faktoren.
4. **Auswahl:** vorhandene Übungen zuerst auf Hauptgruppen und relevante Überlappungen prüfen. Zusätzliche kleine Muskelübungen nur für einen erkennbaren verbleibenden Zweck auswählen; ein anatomischer Nebenmuskelbeitrag ist kein Automatismus für einen zusätzlichen Übungsplatz.
5. **Vorleistung:** eine gemeinsame zentrale Funktion entscheidet Vergleichbarkeit und liefert Alter, letzte passende Session, Last/Wdh und optional e1RM. Keine ähnliche Namenszeichenfolge als Identität; bei fehlender sicherer Vergleichbarkeit ehrliche neue Basislinie.

Konkretes Beispiel ohne Scheingenauigkeit: Drei Bankdrücksätze zählen als drei direkte Brustsätze und erscheinen zusätzlich als relevante Trizeps-/vordere-Schulter-Beteiligung. Ein dreisätziger Hip-thrust-Block ist direkte Glutes-Arbeit; er erfüllt nicht pauschal den Hamstrings-Bedarf. Ein RDL-Block weist dagegen auf Hamstrings- plus Glutes-Arbeit hin. Die genaue notwendige Wochenmenge oder die Auswahl einer weiteren Übung lässt sich aus diesen Zuordnungen allein noch nicht ableiten.

## Lizenz und Wiederverwendung

Die Root-Lizenz ist **GNU AGPL Version 3**. Keine permissive MIT-/Apache-Lizenz. [LICENSE:1–12](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/LICENSE#L1-L12). Bei einer bearbeiteten AGPL-Programmversion verlangt Abschnitt 13 ein entsprechendes Quellcodeangebot an Nutzer, die über ein Netzwerk mit ihr interagieren. Kopieren oder Bearbeiten geschützten Codes ist deshalb eine andere Entscheidung als unabhängig dieselbe allgemeine Idee zu implementieren. Die exakte Reichweite bei einer Kombination hängt vom Integrationsfall ab. [LICENSE:540–551](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/LICENSE#L540-L551), [GNU-Lizenz-FAQ](https://www.gnu.org/licenses/gpl-faq.en.html).

Die Übungs-/Muskel-CSVs haben in dieser Momentaufnahme keine separate permissive Datenlizenz. Nicht davon ausgehen, dass die redaktionelle Auswahl und Koeffizientensammlung beliebig als proprietärer PandaFit-Datensatz kopiert werden darf, nur weil einzelne anatomische Tatsachen allgemein bekannt sind. Für eine wörtliche oder umfangreiche Datenübernahme wären Rechte und gewünschte Produktlizenz gesondert zu klären. Die Studienverweise erlauben, die Originalarbeiten zu lesen und eigene Entscheidungen zu dokumentieren; sie lizenzieren keine fremden Abbildungen oder Volltexte mit.

Marken, Logos und das eingebettete Fabbro-Designsystem sind ebenfalls getrennt zu behandeln. Heracles vendort ein Fabbro-Snapshot; ein eigenes PandaFit-Design braucht diese Assets nicht. [fabbro-design/README.md:1–23](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/fabbro-design/README.md#L1-L23). Empfohlener Weg: **Prinzipien und öffentlich belegte Fakten eigenständig umsetzen; keinen Code, keine komplette CSV und keine Markenassets ungeprüft kopieren.**

## Was tatsächlich geprüft und ausgeführt wurde

Quelltextprüfung umfasste die genannten JS-Kernmodule und relevanten UI-, Historien-, Preset-, SQL- und Python-Pfade, die beiden Relevanz-CSVs, Quellmatrizen, Entscheidungsprotokolle, relevante Dokumentation und Testquellen. Die Matrixgrößen und Verteilungen wurden mit einem eigenen Standardbibliotheksskript aus den CSVs nachgezählt; die ursprüngliche funktionelle Rohmatrix wurde unabhängig nachgerechnet. Primärquellen wurden stichprobenartig für die longitudinale Evidenz und die GNU-Lizenzregeln konsultiert. **Keine vollständige systematische Literaturbewertung aller acht Studien oder aller 4.640 Zellen.**

Ausgeführt wurden **88 Tests, 88 bestanden, 0 fehlgeschlagen**, unter Node `v26.13.0` mit aktivierter Node-Permission-Grenze und ausschließlich Lesezugriff auf das Heracles-Verzeichnis:

```sh
node --permission \
  --allow-fs-read=/private/tmp/pandafit-deep-review-20261106/heracles \
  --test --test-isolation=none \
  tests/set-model.test.mjs tests/analytics.test.mjs \
  tests/relative-e1rm.test.mjs tests/workout-recap.test.mjs \
  tests/preset-ordering.test.mjs
```

Zusätzliche gezielte Funktionsaufrufe reproduzierten die oben genannten RIR-, Validierungs- und Hochwiederholungsfälle ebenfalls unter der Permission-Grenze. Kein `npm install`, kein Package-Script, kein Build und kein Installer wurden ausgeführt.

Vorhanden, aber hier **nicht ausgeführt**: weitere Node-Tests für Session-Flows/Autosave/UI-Wiring, Browser-Smoke-Tests und pgTAP-SQL-Tests, darunter `supabase/tests/rir_set_model.test.sql`, `canonical_equipment_identity.test.sql`, `canonical_workout_schema.test.sql`, `preset_exercise_order.test.sql` und `workout_session_lifecycle.test.sql`. Die RIR-SQL-Tests prüfen beispielsweise Constraints, Herkunft und Formelergebnisse. [supabase/tests/rir_set_model.test.sql:20–56](https://github.com/NeoLorenzo/Heracles/blob/a739f993473915a7d2451cc8ca0ce8fd6cc2378c/supabase/tests/rir_set_model.test.sql#L20-L56). Ohne Datenbankausführung ist weder das aktuelle Produktionsschema noch das korrekte Zusammenspiel sämtlicher Migrationen nachgewiesen. Ohne Browserlauf ist die sichtbare Funktion nicht end-to-end bestätigt. Bestehende grüne Unit-Tests validieren die implementierten Regeln, nicht deren sportwissenschaftliche Wahrheit.

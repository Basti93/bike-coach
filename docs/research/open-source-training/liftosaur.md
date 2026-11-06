# Liftosaur – Quellcodeprüfung für PandaFit

Stand: 06.11.2026. Geprüfter Snapshot: `astashov/liftosaur@bd12069c950e3223c17ba9ec4d15d5122c2fa61d`. Keine Installation oder Ausführung der Gesamtanwendung. Zwei isolierte, zuvor gelesene reine Module wurden mit vorhandenen Werkzeugen gebündelt und mit synthetischen Eingaben ausgeführt. Die fremden Testdateien wurden gelesen, nicht als vollständige Suite ausgeführt.

## 1. Übernehmbarer Kern: Regeln mit explizitem Zustand

Die eingebauten Progressionen werden in Regeln übersetzt, die tatsächliche Wiederholungen, ausgeführte Gewichte und optional RPE vergleichen. Die normale doppelte Progression erhöht Wiederholungen innerhalb des übungsbezogenen Bereichs; erst nach Erreichen des oberen Endes erhöht sie das Gewicht. Eine zweite Variante behandelt Wiederholungsbereiche gesondert. Das ist wesentlich differenzierter als ein einziger globaler Wiederholungsbereich.

Quelle: [plannerProgramExercise.ts:609–658](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/pages/planner/models/plannerProgramExercise.ts#L609-L658).

Wichtig für PandaFit: tatsächliche Last statt der alten Planlast als Ausgangspunkt, konkrete Grenzen pro Übung und Geräteinkremente. Keine Gewichtssteigerung allein deshalb, weil ein globales Ziel erreicht wurde. Die Skriptsprache als Ganzes ist dafür unnötig: einige typisierte Regelarten reichen zunächst.

## 2. Änderungen während einer Einheit und dauerhaftes Programm sind getrennt

Die Dokumentation unterscheidet `update` für die laufende Einheit von `progress` für das nach Abschluss geänderte Programm. Fortschrittsänderungen werden vorab gezeigt und können für diese Einheit unterdrückt werden. Programmzustand und tatsächliche Ausführung sind getrennte Größen. Der Zusammenhang zwischen diesen Ebenen wird dem Nutzer erklärt.

Quelle: [Progressions and State](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/docs/features/progressions.md).

Übernehmen: verständliche Vorschau „nächstes Mal“, Geltungsbereich und Undo. Anpassen: keine freie Programmiersprache im normalen PandaFit-Nutzerfluss, keine von einer KI erzeugten ausführbaren Skripte. Ausgeführte Sätze müssen bei Änderungen offener Sätze unverändert bleiben; PandaFit hat dafür bereits eine brauchbare Basis in `applyWorkoutChange`.

## 3. Geräteregeln sind Teil der Progression

Der Lastrechner modelliert Grundgewicht, Anzahl beladener Seiten, begrenzte Scheibenbestände, Steckgewichte, feste Hanteln und weitere Gerätetypen. Inventar wird pro Seite geteilt und abgerundet; eine ungerade Scheibenanzahl liefert keine zusätzliche symmetrische Beladung. Der Algorithmus kann Kombinationen finden, die eine naive Auswahl der jeweils größten Scheibe verfehlt.

Quellen: [equipmentLoadSolver.ts:490](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/models/equipmentLoadSolver.ts#L490), [Auswahl und Rundung:615–737](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/models/equipmentLoadSolver.ts#L615-L737), [Tests](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/test/equipmentLoadSolver.test.ts).

Isoliert ausgeführte Gegenproben:

| Eingabe | Tatsächliches Ergebnis | Bedeutung |
|---|---|---|
| 20-kg-Stange, Ziel 15 kg | 20 kg, `exact=false` | Selbst „abrunden“ kann bei fehlender leichterer Option über dem Ziel landen. |
| 20-kg-Stange, drei 10-kg-Scheiben, Ziel 60 kg | 40 kg | Nur ein symmetrisches Paar verfügbar. |
| Stange 0 kg, zwei 4-kg- und vier 3-kg-Scheiben, Ziel 12 kg | Je Seite zwei 3-kg-Scheiben, exakt | Nicht gierige Kombinationssuche funktioniert. |

PandaFit sollte Zielgewicht, tatsächlich ladbares Gewicht und Abweichung getrennt anzeigen. Wenn eine Stange bereits schwerer als das Ziel ist, nicht stillschweigend das höhere Gewicht empfehlen, sondern eine andere Stange oder Übung anbieten. Ein unbekanntes Smith-Grundgewicht bleibt unbekannt. Pulley-Ratio oder Nettowiderstand dürfen nicht aus einer generischen Gerätebezeichnung erfunden werden.

## 4. Supersätze sind Gruppen, nicht Nachbarschaften

Die Navigation sucht Gruppenmitglieder über die Superset-Zuordnung. Fertige Übungen werden beim Weiterschalten übersprungen, Aufwärmsätze lösen den normalen Gruppenwechsel nicht aus. Das ist die passende Grundlage für beliebige Partner und unterschiedliche Satzanzahlen.

Quellen: [progress.ts:523–598](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/models/progress.ts#L523-L598), [Superset-Dokumentation](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/docs/features/supersets.md).

Nicht unverändert übernehmen: Ein globaler Superset-Timer wird nach jedem Arbeitssatz verwendet. Er unterscheidet hier nicht automatisch zwischen Gerätewechsel und Erholung nach einer kompletten Runde. PandaFit braucht diese beiden Übergänge ausdrücklich, sonst wird aus „15 Sekunden zum Wechseln“ versehentlich auch „15 Sekunden bis zur nächsten Runde“.

## 5. Umordnen erhält die aktuell ausgewählte Übung

Die Umordnungsfunktion verschiebt die Einträge, aktualisiert Positionsfelder und berechnet die neue Position der vorher ausgewählten Übung. Die Daten der Übungen und Sätze bleiben bestehen. Das ist die für einen Tracker wichtige Eigenschaft, nicht die Drag-Animation allein.

Quelle: [workoutStripReorder.ts:32–67](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/utils/workoutStripReorder.ts#L32-L67), [zugehörige Tests](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/test/workoutStripReorder.test.ts).

Ausgeführte Gegenprobe: Kniebeuge von Position 1 ans Ende verschoben, während Rudern ausgewählt ist. Rudern bleibt ausgewählt; erledigte und offene Sätze bleiben ihren IDs zugeordnet. Für PandaFit zusätzlich Tastatur/Hoch-Runter-Aktion, Reload, Sync und Superset-Bezüge prüfen.

## 6. Mehrere Muskelrollen mit Schutz gegen Doppelzählung

Direkt getroffene Gruppen werden vor der Zählung dedupliziert; dieselbe Gruppe wird aus der Liste sekundärer Gruppen entfernt. Sekundäre Beiträge sind konfigurierbar, standardmäßig 0,5. Werden mehrere sekundäre Einzelmuskeln derselben Gruppe zugeordnet, verwendet die Zusammenfassung den höchsten Beitrag statt ihrer Summe.

Quellen: [muscle.ts:326–387](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/models/muscle.ts#L326-L387), [exercise.ts:4859–4931](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/models/exercise.ts#L4859-L4931), [Settings-Standard](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/models/settings.ts#L90).

Übernehmen: mehrere Rollen, deduplizierte Gruppen, Quellen- und Modellversion. Nicht übernehmen: die Zahl 0,5 als individuell gemessene Beteiligung darstellen. Gruppenaggregation kann relevante Unterschiede zwischen Muskelköpfen wieder verbergen. Eine feine interne Zuordnung und eine verständliche grobe Ansicht müssen getrennt bleiben.

## 7. Wissenschaftlich problematische Darstellung: harte Grenze bei acht Wiederholungen

Ein aktiv verwendeter Darstellungsweg ordnet einen Satz ab acht Wiederholungen „Hypertrophie“, darunter „Kraft“ zu. Dieser Weg wird von Muskelansichten und Programmvorschauen aufgerufen. Daneben gibt es bereits eine zusammengefasste Zählung für andere Oberflächen; die kritisierte Grenze betrifft also nicht sämtliche Volumenzählungen.

Quellen: [muscle.ts:389–457](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/models/muscle.ts#L389-L457), [Aufruf im Muskelbildschirm](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/components/muscles/screenMusclesDay.tsx#L24).

Das ist eine Darstellungsheuristik und kein biologischer Übergang. Ein fordernder Satz mit sieben Wiederholungen verliert nicht seinen Muskelaufbaureiz. Für PandaFit verwerfen: getrennte biologische „Kraft-“ und „Hypertrophiesätze“ anhand einer einzelnen Wiederholungsgrenze. Ziel, Last, Anstrengung und tatsächlich ausgeführte Arbeit getrennt zeigen.

## 8. Wissenschaftliche Überdehnung in Zielvorgaben

Die Ziel-Presets setzen 4–10, 10–18 oder 18–30 fraktionale Wochensätze und leiten eine Mindestfrequenz von zwei sowie eine Verteilung über höchstens elf Sätze pro Sitzung ab. Der Kommentar erklärt elf als Punkt, ab dem Wachstum nicht mehr messbar steigt. Diese Aussage ist stärker als ein populationsbasiertes Modell abnehmenden Grenznutzens rechtfertigt. Die Mindestfrequenz ist eine eigene Planungswahl, keine allgemeingültige Pflicht.

Quelle: [muscleRangePresets.ts:7–40](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/models/muscleRangePresets.ts#L7-L40).

Für PandaFit: auf das reale Zeitbudget und individuelle Rückmeldungen abgestimmte Bereiche, Änderungen begrenzt und begründet. Keine Pflicht, für jede Gruppe immer dieselbe Zielzone zu erreichen. Die Frequenz folgt unter anderem der Verteilung sinnvoller Arbeit und den tatsächlichen Gelegenheiten.

## 9. Pausensystem: eine gute Vorrangfolge, keine gemessene Optimierung

Der konkrete Satz-Timer hat Vorrang vor Superset-Einstellung und anschließend Warmup-/Workout-Standard. Der Zustand speichert Startzeit und Dauer. Überfällige Pushs werden nicht erneut geplant. Nutzer können den Timer verlängern; das Signal beendet nicht automatisch jede Erholung.

Quelle: [progress.ts:462–520](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/src/models/progress.ts#L462-L520).

Übernehmen: transparente Vorrangfolge und stabiler Timer. Nicht behaupten: Liftosaur berechne hier die individuell optimale Erholung anhand physiologischer Messungen. Für PandaFit müssen geplante Pause, tatsächlicher Timer und Leistungsrückmeldung unterschieden werden.

## 10. Lizenz und Übernahmeform

Das Repository trägt AGPLv3. Ein direkter Code-Transfer in eine weiterhin ausschließlich MIT-lizenzierte PandaFit-Codebasis ist kein lizenzneutraler Schritt. Der bevorzugte Ansatz ist eine eigene Implementierung der untersuchten Verhaltensweisen und Testanforderungen. Vor einer tatsächlichen Übernahme von Quellcode, Metadaten, Texten oder Bildern sind deren jeweilige Bedingungen separat zu prüfen; die App-Lizenz allein genügt nicht für jedes Asset. Es wurde kein Fremdcode in PandaFit übernommen.

Quelle: [Lizenz am geprüften Commit](https://github.com/astashov/liftosaur/blob/bd12069c950e3223c17ba9ec4d15d5122c2fa61d/LICENSE).

## Urteil

Liftosaur liefert die stärksten konkreten Vorbilder für überprüfbare Progressionsregeln, Ausführungs-/Programmebenen, Gerätemodell, Superset-Gruppen und verlässliches Umordnen. Es liefert keinen pauschal wissenschaftlich überlegenen Trainingsplan. Die Wiederholungsgrenze in Muskelansichten, uniforme Ziel-Presets und die vereinfachte Superset-Pause sollten nicht in PandaFit wandern.

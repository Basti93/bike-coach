# PandaFit: Zielarchitektur und schrittweise Migration

Stand: 06.11.2026, Basis `1e27789`. Architekturentscheidung zur Vorbereitung der Implementierungsaufträge; **kein ausführbarer Gesamtimplementierungsplan**. Grundlage: [Produktkonzept](../superpowers/specs/2026-11-06-adaptive-training-coach-design.md) und [Trainingswissenschaft](2026-11-06-training-science-foundation.md).

## Empfehlung

Zuerst das gewünschte fachliche Verhalten und seine Begriffe festlegen. Dann jede Änderung mit dem vorhandenen System abgleichen und entlang nutzbarer Abläufe einführen. Der vorhandene Code ist weder die fachliche Vorgabe noch pauschal zu verwerfen.

Das bedeutet: Ziele, Regeln, Geräte, Trainingsbeiträge, Plan und Ausführung werden nach dem neuen Konzept modelliert. Bestehende Laufzeit, Aufzeichnung, Speicherung und Synchronisierung bleiben die Grundlage. Fachlich widersprüchliche Funktionen werden an ihrer tatsächlichen Aufrufstelle ersetzt. Ein zweites vollständiges Produkt oder eine dauerhaft parallel gepflegte Planungslogik ist nicht vorgesehen.

## 1. Was im Code bereits trägt

| Bereich | Tatsächlicher Bestand | Entscheidung |
|---|---|---|
| Coach-Ausführung | `src/coach/runtime.ts` verbindet Rad, Kraft, Laufen, Chat, Integrationen und Records. `coachHere` berücksichtigt die Zuständigkeit je Profil. | Erhalten und als Einbindungspunkt nutzen. Keine neue zweite Coach-Laufzeit aufbauen. |
| Trainingsspeicherung | `src/tracking/store.ts` serialisiert Änderungen, merkt ungespeicherte Zustände, wiederholt fehlgeschlagene Schreibvorgänge und schützt lokale Eingaben beim Nachladen. | Erhalten, gezielt um benötigte Änderungsabläufe erweitern. Vorhandene Invarianten durch bestehende und neue Integrationsfälle schützen. |
| Haltbarkeit und Konflikte | `src/coach/tracking/store.ts` schreibt per temporärer Datei, `fsync` und Umbenennung; `src/tracking/kept-copy.ts` hält konkurrierende Trainingsversionen auseinander. | Bestehende Mechanismen wiederverwenden. Für neue Objekte ausdrücklich prüfen, welche Konfliktsemantik sie benötigen. |
| Gemeinsame Ausführung | `src/tracking/session.ts` ist ohne Browser-/Node-Abhängigkeiten verwendbar. Übungen und Sätze besitzen stabile `rid`; der Timer speichert Start und Dauer. | Bestehende Modellteile und IDs erhalten. Umordnen und Gruppennavigation erweitern diese Grundlage. |
| Liveänderungen | `src/tracking/workout-change.ts` wendet Änderungen auf offene Sätze an und bewahrt erledigte Sätze. | Schutzverhalten erhalten, Änderungsziele, Versionierung, Rücknahme und Zukunftsabsichten ergänzen. |
| Externe Daten | `GymCoach.history()` führt eigene und importierte Historie zusammen; optionale Hevy-Schreibzugriffe sind getrennt angebunden. | Integrationen als Adapter erhalten, neue Fachmodelle nicht an deren Namen oder Datenformat binden. |
| Oberfläche | `src/tracking/ui/**` wird für Mac und Web verwendet. | Bestehende Ansichten schrittweise erweitern; keine getrennte neue App entwickeln. |

Dies ist eine Quellcodebewertung, kein Nachweis, dass die gesamte bestehende Implementierung fehlerfrei ist. Für diesen Architekturvergleich wurde keine vollständige Testsuite ausgeführt.

## 2. Was fachlich erweitert oder ersetzt werden muss

| Vorhandenes Modell / Verhalten | Konkrete Lücke | Gewünschte Richtung |
|---|---|---|
| `src/shared/week-plan.ts`: ein `sport` je Tag, genau sieben Tage | Kombinationen an einem Tag und undatierte Gelegenheiten passen nicht in das Modell. | Trainingsgelegenheiten und ihre Bestandteile darstellen; Woche bleibt eine Ansicht bzw. Anordnung darauf. Alte Wochenpläne lesbar halten. |
| `src/coach/chat/plan-hint.ts`: strukturierter Plan wird zu Prompttext | Unter anderem fehlt `legs` im übertragenen Tagesobjekt. | Verbindliche Planvorgaben strukturiert bis zum zuständigen Planer erhalten. Text ist eine Darstellung des gemeinsamen Kontexts. |
| Sport-Coaches mit eigenen Vorgaben und Prüfern | Neue fachliche Bereiche können an alten globalen Grenzen scheitern. | Gemeinsame versionierte Policy für Entwurf, Prüfung, Fallback und Anzeige; sportartspezifische Ausführung bleibt spezialisiert. |
| Namens-/Gerätezuordnung und primärer Muskel | Varianten, Gerätevergleich und direkte/indirekte Arbeit sind unzureichend beschrieben. | Gemeinsames Übungs-/Gerätemodell mit nachvollziehbarer Herkunft. Bestehende IDs nicht grundlos austauschen. |
| Vorleistung und Progression | Vergleichseinheiten und Lastsprünge sind teilweise fachlich ungeeignet. | Vergleiche über echte unterschiedliche Gelegenheiten; erreichbare Schritte und übungsbezogene Bereiche. |
| `linkSuperset()` und `confirmSet()` in `src/tracking/session.ts` | Verknüpfung mit dem nächsten Eintrag; Navigation/Erholung hängen an Listenpositionen. | Mitgliedschaft, Reihenfolge und Rundenlogik ausdrücklich modellieren; stabile Satzdaten weiterverwenden. |
| `WorkoutChange` und freigegebener Workout-Entwurf | Eine konkrete laufende Workout-ID ist nicht dasselbe wie eine dauerhafte Vorgabe oder Änderung des nächsten Trainings. | Dauerregel, Vorlage, nächster Plan und laufende Einheit getrennt adressieren. |
| Records mit `body: unknown` | Erweiterbare Hülle löst nicht das Problem, dass alte Leser neue Angaben entfernen können. | Schemafähigkeit, Roundtrip-Erhalt und Schreibberechtigung nach Versionsfähigkeit prüfen. |

## 3. Module nach fachlicher Verantwortung

Die folgenden Namen beschreiben Verantwortlichkeiten, noch keine festgelegten Ordner oder TypeScript-Interfaces:

1. **Übungs- und Gerätewissen:** Identität, Variante, Muskelrollen, Lastkonvention, erreichbare Gewichte.
2. **Trainingsauswertung:** tatsächliche Beobachtungen, vergleichbare Vorleistung, Beiträge und erkennbare Datenlücken.
3. **Persönlicher Trainingsrahmen:** Ziele, Prioritäten, dauerhafte Regeln, vorübergehende Abweichungen, Verfügbarkeit.
4. **Planung:** nächster sinnvoller Umfang und Verteilung; KI-Entwurf, gemeinsame Prüfung, begrenzte Korrektur und Fallback.
5. **Änderung und Ausführung:** Plan übernehmen, offene Sätze bearbeiten, Reihenfolge und Gruppen, dauerhafte Ziele von Änderungen, Undo.

Die vorhandene Laufzeit verbindet diese Module mit Speicherung, UI und Integrationen. Sie soll nicht selbst alle fachlichen Entscheidungen enthalten. Ein Modul erhält eine gemeinsame Verantwortung, wenn seine Implementation Wissen bündelt, das sonst in mehreren Aufrufern auseinanderläuft. Ein zusätzliches Interface allein bringt diese Locality nicht.

Für reine Berechnung reichen normale TypeScript-Funktionen ohne Framework. Ein Adapter ist dort sinnvoll, wo bereits tatsächlich unterschiedliche Umgebungen existieren, beispielsweise Mac- und Webspeicherung. Eine allgemeine Plugin-Engine, ein Microservice-System oder eine frei programmierbare Regelsprache ist für diese Einführung nicht begründet.

## 4. Die neue Logik in vorhandene Abläufe einführen

Für jede Änderung gilt dieselbe Folge:

1. **Zielverhalten:** konkrete Eingaben und erwartetes Ergebnis aus Konzept und Fachgrundlage festhalten.
2. **Bestandsweg:** vom sichtbaren Vorgang bis zu Lesen, Prüfen und Schreiben verfolgen; nicht nur eine gleichnamige Hilfsfunktion finden.
3. **Entscheidung:** vorhandenes Modul unverändert nutzen, erweitern oder dessen Implementation ersetzen; Grund und betroffene Aufrufer nennen.
4. **Prüfbarer Durchstich:** neue fachliche Funktion an mindestens einen tatsächlich genutzten Ablauf anschließen. Rückgabe allein ohne produktiven Aufrufer genügt nicht.
5. **Nachweis:** fachlichen Fall und relevante Speicher-/Versionsfälle über die öffentliche Verwendung des Moduls prüfen.
6. **Ablösung:** alten Pfad für diesen Anwendungsfall entfernen oder ausdrücklich befristet weiterführen; Restarbeit und Abbaukriterium nennen.

Vorübergehende Adapter können alte Daten in das neue Modell lesen. Sie dürfen fehlende RIR oder Geräteidentitäten nicht erfinden und keinen parallelen dauerhaften Regelbestand schaffen.

## 5. Einführung in funktionsfähigen Schritten

Die bisherige Liste mit Auftrag 0–12 beschreibt fachliche Pakete. Für ausführbare Pläne werden deren Abhängigkeiten nochmals aufgelöst. Insbesondere dürfen neue Ziele und Regeln nicht monatelang nur gespeichert werden, ohne in der Planung zu wirken.

| Schritt | Sichtbarer Nutzen / Nachweis | Umfang |
|---|---|---|
| 0: Evidenz und Regelvertrag | Startwerte, Herkunft und Konfliktklassen sind eindeutig. Ein erster Verbraucher verwendet die gemeinsame Grundlage. | Auftrag 0 konkretisieren; technische Fachtests und bestehende Policy-Anbindung gemeinsam planen. |
| 1: Übungsbasis bis zur Ansicht | Korrekte Variantenbeschreibung und Muskelanzeige einer tatsächlich verwendeten Übung. | Identität/Zuordnung, Leser und Darstellung zusammen; keine bloße Katalogmigration. |
| 2: Muskelbeiträge bis zum nächsten Vorschlag | Indirekte Armarbeit und getrennte Gesäß-/Beinbeugerarbeit beeinflussen Erklärung und Auswahl nachvollziehbar. | Auswertung, Planungskontext, betroffener Prüfer und Anzeige verbinden. |
| 3: Gerät bis zur Progression | Ein erreichbarer Lastschritt erscheint im nächsten Vorschlag und im Rechner. | Gerätefähigkeit, Vorleistung, Vorschlag, Prüfer und Darstellung aus einer Quelle. |
| 4: Regel bis zur Planwirkung | Eine eindeutig dauerhafte Anweisung wird gespeichert, angezeigt und bei der nächsten Planung wirksam. Löschen entfernt ihre Wirkung. | Verwaltung, Kontext und echter Planer gemeinsam; überschaubare erste Regelarten. |
| 5: Gelegenheit bis zum abgestimmten Plan | Flexible Gelegenheit und Kombination aus Kraft/Ausdauer sind darstellbar und verwenden dieselben Vorgaben. | Altes Wochenmodell adaptieren, Kontextübergabe und gemeinsame Prüfung ergänzen. |
| 6: Änderung bis zum Wiederöffnen | Eine angenommene Zukunftsänderung überlebt Entwurf schließen/Neustart; veraltete Vorschläge überschreiben keine neuen Eingaben. | Änderungsziel, Speicherung, Version, Materialisierung und Undo zusammen. |
| 7: Veränderbare Ausführung | Freie Reihenfolge und Superset-Partner funktionieren beim Speichern, Pausieren und Wiederaufnehmen. | Vorhandene IDs und Stores erhalten, Gruppennavigation und passende Pausen ergänzen. |
| 8: Coach und langfristige Anpassung | Datum/Historie, konsistente Gründe und nachvollziehbare Weiterentwicklung über Wochen. | Bereits angeschlossene Fachmodule nutzen; keine zweite Analyse im Chat. |

Diese Schritte ordnen die bisherigen Fachpakete, ersetzen aber noch nicht ihre detaillierten Implementierungspläne. Vor jeder Ausführung werden konkrete Dateien, Interfaces, Migrationen, Fälle und Prüfkommandos für genau diesen Schritt festgelegt. Ein Gesamtplan mit spekulativen Details für alle dreizehn Pakete wäre bereits nach den ersten Änderungen veraltet.

## 6. Migrationsregeln

- Bestehende Aufzeichnung, Profile, Trainings- und Satz-IDs bleiben erhalten. Rohbeobachtungen werden nicht aus neuen Schätzmodellen zurückgeschrieben.
- Erweiterungen werden zunächst lesbar gemacht, dann neue Schreibwege aktiviert. Alte Clients dürfen unbekannte Angaben nicht entfernen; inkompatible Bearbeitung wird begrenzt.
- Speicher-/Syncfähigkeit wird je Objekt nachgewiesen. Die bestehende Konfliktkopie für Trainings ist nicht automatisch die richtige Semantik für jede neue Regel oder jeden Vorschlag.
- Planvorschläge verwenden einen gemeinsamen Kontextstand mit nachvollziehbarer Version. Während eines KI-Aufrufs geänderte Eingaben müssen bei Annahme berücksichtigt werden.
- Eine neue Fachfunktion wird nicht gleichzeitig als zweiter unabhängiger Autor aktiviert. Pro Profil bleibt die bestehende Autorzuständigkeit wirksam.
- Ein Ausweichplan durchläuft dieselben aktiven Mindestprüfungen. Technische Gerätegrenzen bleiben von veränderbaren Trainingsheuristiken getrennt.
- Rückfall ist pro Schritt definiert. Er kann die neue Funktion deaktivieren, aber darf inzwischen gespeicherte neue Beobachtungen oder Regeln nicht vernichten. Ein alter Client wird dadurch nicht automatisch wieder schreibfähig.
- Aufzeichnung und manuelle Bedienung bleiben bei Netz-/KI-Ausfall nutzbar. Neues Modellwissen erzeugt keine neue Aufzeichnungspflicht.
- Während einer offenen Radfahrt gelten die Repository-Sperren. Keine Service-Neustarts, Installationen oder Änderungen in gesperrten Bereichen.

## 7. Prüfstrategie

Vorhandene Tests werden nach erwarteten Eigenschaften eingeordnet: Datenerhalt, Offlinebetrieb, konkurrierende Geräte und bewusste Übernahme schützen weiterhin das Produkt. Tests, die eine absichtlich ersetzte Trainingsheuristik festschreiben, werden nach begründetem neuem Verhalten angepasst; der alte Test allein entscheidet keine wissenschaftliche Produktfrage.

Ausgewählte vorhandene Anknüpfungspunkte:

- `tests/tracking/store.test.ts`, `lost-write.test.ts`, `sync-conflict.test.ts` und `ancestry.test.ts`: dauerhafte Eingaben und konkurrierende Geräte.
- `tests/tracking/session.test.ts` und `workout-change.test.ts`: stabile Ausführung und Schutz erledigter Sätze.
- `tests/coach/gym/wiring.test.ts`, `own-history.test.ts` und `history.test.ts`: echte Eingänge und historische Vergleichsdaten.
- `tests/coach/chat/plan-hint.test.ts` und `tests/shared/week-plan.test.ts`: vollständige Vorgaben und Übergang des Wochenmodells.
- `tests/web/idb-store.test.ts` und `tests/server/sync-api.test.ts`: ergänzte Daten durch tatsächliche Speicher-/Transportwege.

Im ausführbaren Teilplan werden passende Tests und Typprüfung genannt; keine pauschale Zusage, dass bestehende Tests schon bestanden hätten. Die kleinen UI-Korrekturen benötigen keine neue Testarchitektur. Für Datenmigration, Undo und geräteübergreifende Konflikte sind gezielte Integrationsfälle notwendig.

## 8. Nächster Planungsschritt

Als Nächstes wird **ein ausführbarer Plan für den ersten Durchstich** erstellt: Evidenz-/Regelvertrag plus die dafür nötige minimale bestehende Anbindung, danach Übungsbasis bis zur Ansicht. Die Zielsemantik kommt aus den beiden Konzeptdokumenten; genaue Modul-Interfaces und Änderungen entstehen am gelesenen produktiven Pfad. Danach folgt die Implementierung dieses Schritts mit dessen Prüfungen, bevor die Details des nächsten eingefroren werden.

Größere Neuschreibungen sind nur begründet, wenn ein Modul seine neue fachliche Verantwortung nicht ohne dauerhaft widersprüchliche Modelle erfüllen kann. Die Begründung nennt seinen Umfang, seine Aufrufer, die übernommenen Invarianten, Migration und Rückfall. Eine pauschale Komplettneuschreibung ist aus dem geprüften Bestand nicht gerechtfertigt.

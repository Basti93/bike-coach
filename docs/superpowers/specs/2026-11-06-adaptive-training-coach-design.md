# PandaFit: persönlicher, wissenschaftlich begründeter Trainingscoach

Status: **Grundkonzept zur gemeinsamen Prüfung**, keine Freigabe zur Produktimplementierung. Erstellt am 06.11.2026 aus Nutzungsrückmeldungen, bestätigten Entscheidungen und der [Quellcode- und Literaturrecherche](../../research/2026-11-06-open-source-training-audit.md). Ergänzt um die [wissenschaftliche Trainingsgrundlage für Kraft, Hypertrophie, Ausdauer und HIIT](../../research/2026-11-06-training-science-foundation.md).

Kennzeichnung: **Bestätigt** bezeichnet Anforderungen aus dem Gespräch oder geltenden Projektvorgaben. **Entwurfsentscheidung** bezeichnet eine konkrete Empfehlung des Autors, die im Rahmen dieses Gesamtkonzepts geprüft werden soll. Technische Einzelheiten, die ausdrücklich dem Implementierer überlassen werden, sind keine offenen Produktfragen.

## 1. Leitidee

**PandaFit plant, begleitet und entwickelt das Training einer Person über mehrere Sportarten hinweg – anhand ihrer Ziele, ihrer Möglichkeiten und dessen, was tatsächlich passiert ist.**

Der Coach trifft übliche Trainingsentscheidungen selbstständig. Er kann wichtige Abwägungen erklären, persönliche Vorgaben dauerhaft berücksichtigen und seine Planung bei Veränderungen anpassen. Ein Trainingsprotokoll bleibt verlässlich, auch wenn Netz, Planung oder KI ausfallen.

Das Produkt soll die Person von Planungsarbeit entlasten. Wissenschaftliche Grundlagen geben Orientierung; persönliche Entwicklung, Präferenzen und Unsicherheit bleiben sichtbar. Mehr Übungen, mehr Detailwerte oder mehr KI-Antworten sind für sich kein Erfolgskriterium.

## 2. Was bereits feststeht

| Bestätigte Anforderung | Konsequenz |
|---|---|
| Ziele und Prioritäten sind persönlich und veränderbar. | Muskelaufbau und Ausdauer können gleichrangig sein; keine Sportart hat eingebauten Vorrang. |
| Menschen planen unterschiedlich. | Wochenplanung, spontane Einheiten und die bereits in der bestehenden Chat-Spezifikation vorgesehene Kombination müssen funktionieren. |
| Zeit ist nicht für alle eine feste Grenze. | Eine Dauer kann vorgegeben oder vom Coach als Folge einer sinnvollen Einheit geschätzt werden. |
| Der Coach soll eigenständig handeln. | Auswahl, Reihenfolge, Vorbereitung, Wiederholungen, Pausen und vereinbarte Progression brauchen keine ständige Einzelbestätigung. |
| Größere Änderungen im laufenden Training werden angeboten. | Vorschau, Übernehmen und Undo; absolvierte Sätze bleiben erhalten. |
| Eindeutig dauerhafte Anweisungen dürfen direkt gespeichert werden. | Sichtbare, bearbeitbare Regeln; Rückfrage bei mehrdeutigen langfristigen Aussagen. |
| Tagesentscheidungen sind keine neuen Lebensziele. | „Heute keine Kniebeugen“ gilt heute; eine schlechte Einheit schreibt keine dauerhaften Ziele um. |
| Übungen und Reihenfolge müssen im Training veränderbar sein. | Drag-and-drop und beliebige Superset-Partner mit verlässlichem Wiederaufnehmen. |
| Ein Training geht nicht verloren. | Lokales Speichern, Offline-Fortsetzung und bestehende Sync-/Konfliktsicherung bleiben tragend. |

Weiter geltende Produktprinzipien: keine Schuld, kein Nachholen durch Überladen, keine Streak-Pflicht, keine Vergleiche zwischen Personen, keine ungefragten Benachrichtigungen. Hevy und Garmin bleiben optional. Die vorhandene Radaufzeichnung wird weder neu gebaut noch durch Coacharbeit gefährdet. Produkttexte bleiben Deutsch.

## 3. Umfang und Grenzen

Dieses Konzept umfasst gemeinsame Ziel- und Planungslogik für Kraft, Rad und Laufen sowie die Verbesserung der Kraftplanung und Trainingsbedienung. Bestehende Beweglichkeitsangebote bleiben anschlussfähig; Ernährungsplanung und sonstige Appbereiche werden nicht neu entworfen.

Zum Umfang gehören Übungsdaten, Muskelbilanz, Progression, Aufwärmen, Pausen, Supersätze, Reihenfolge, Stangen-/Scheibenberechnung, persönliche Regeln, dauerhafte Änderungen und verständliche Coach-Unterhaltung.

Es wird kein medizinisches Diagnoseprodukt, keine exakte Muskelwachstumsvorhersage und kein universeller physiologischer Erholungsrechner gebaut. Es ist kein Wechsel der bestehenden App-Technik, kein Neubau aller Sport-Coaches und keine vollständige Skriptsprache vorgesehen. Fremdprojekte dienen als geprüfte Referenzen; Code, Daten und Bilder werden nicht pauschal importiert.

### Wissenschaftliche Grundlage als Bestandteil des Konzepts

**Bestätigt:** Kraftentwicklung, Hypertrophie, Ausdauer und HIIT sollen fachlich ausgearbeitet werden. Die frühere Recherche mit Schwerpunkt Krafttraining deckte dies noch nicht gleichmäßig ab. Die [ergänzende Literaturprüfung](../../research/2026-11-06-training-science-foundation.md) dokumentiert jetzt 26 Quellen, deren Lesetiefe, relevante Befunde, Grenzen und daraus abgeleitete Vorschläge. Sie ist keine vollständige systematische Übersichtsarbeit.

**Entwurfsentscheidung:** Ziele, Methoden und Messgrößen werden getrennt. Kraft, Muskelaufbau und Ausdauer beschreiben gewünschte Anpassungen. HIIT ist eine gezielt auswählbare Methode mit eigenständiger Dosisbeschreibung. Eine höhere FTP-Schätzung ist keine direkte VO₂max-Messung; Trainingsvolumen misst kein entstandenes Muskelgewebe.

Die fachliche Grundlage umfasst:

- Kraft: spezifische Zielübungen, passende Lastbereiche, Wiederholung der Zielbewegung, Reihenfolge und begründete Progression.
- Hypertrophie: direkter/indirekter Umfang, Anstrengung, Wiederholungsbereiche, Pausen, Vorbereitung und passende Übungsauswahl.
- Ausdauer: kontinuierliche Belastung, Ziel-/Trainingsstatus, Herkunft der Intensitätsanker und flexible Intensitätsverteilung; keine pauschale 80/20-Pflicht.
- HIIT: Protokollfamilie, vollständige Belastungs-/Erholungsdosis, Sportart, Vorbereitung, Progression und zielgerechte Auswertung; keine automatisch verordneten Maximalsprints.
- Kombination: persönliche Prioritäten, lokale und sportartspezifische Belastung, Zeitkonflikte und tatsächliche Verträglichkeit.

Die anfängliche HIIT-Ausarbeitung knüpft an den vorhandenen Radtrainer an. Bestehende persönliche Laufziele wie „erst Distanz, dann Tempo“ bleiben erhalten; eine allgemeine Forschungsgrundlage aktiviert keine neue Trainingsmethode gegen diese Vorgaben. Eine spätere Laufintervall-Erweiterung wird eigens geplant.

Jede verwendete Planungsregel unterscheidet Forschungsbefund, Unsicherheit und konkrete Produktpolicy. Die gemeinsamen Planer nutzen eine versionierte Grundlage für Prompt, Prüfung, Fallback und Erklärung. Eine neue Quelle ändert keine laufende Einheit automatisch. Bestehende Grenzen werden erst mit geprüftem Übergang im jeweils zuständigen Arbeitspaket ersetzt.

## 4. Ein Coach aus Nutzersicht, spezialisierte Planung im Inneren

**Entwurfsentscheidung:** Die vorhandenen Kraft-, Rad- und Lauf-Coaches bleiben fachliche Komponenten. Darüber liegt ein gemeinsamer Trainingskontext. Ein zentraler Gesprächseinstieg nimmt Wünsche entgegen und leitet sie intern an die zuständige Planung weiter.

Die Person bekommt eine zusammenhängende Antwort. Sie muss nicht herausfinden, welchen Coach sie für eine Übungsfrage oder einen Wochenkonflikt fragen darf. Eine Aussage wie „ist geändert“ ist erst zulässig, wenn die betreffende Änderung dauerhaft gespeichert wurde. Eine bloße Weitergabe an eine andere Komponente wird als ausstehend kenntlich gemacht.

Alle Planer und Anzeigen verwenden dieselben Ziele, Regeln, Übungsidentitäten, Belastungsdaten und bestätigten Vereinbarungen. Fachliche Zuständigkeit bedeutet keine voneinander getrennten Wahrheiten.

## 5. Persönliche Ziele und verfügbarer Rahmen

**Entwurfsentscheidung:** Ziele beschreiben gewünschte Entwicklung, etwa Muskelaufbau, Kraft oder Ausdauer. Die dafür gewählten Sportarten sind getrennt davon gespeichert. Prioritäten werden zunächst verständlich als gleichrangig, Schwerpunkt oder Erhaltungsziel ausgedrückt; eine künstlich genaue Prozentverteilung ist nicht erforderlich.

Eine Person kann langfristige Ziele haben, einen befristeten Schwerpunkt wählen und für heute abweichen. Ein befristeter Fokus überschreibt die langfristige Ausrichtung nicht. Nach seinem Ende wird die weiterhin gespeicherte Grundausrichtung wirksam; eine Änderung wird sichtbar statt durch überraschende neue Ziele bemerkbar.

Der verfügbare Rahmen enthält Trainingstage oder offene Gelegenheiten, gewünschte Ruhezeiten, bevorzugte Sportarten, bekannte Geräte und optional Zeitgrenzen. Ein fester Wochenplan ist keine Zugangsvoraussetzung. Auch eine Person mit nur einer Sportart kann alle relevanten Funktionen nutzen.

Ohne Zeitlimit plant der Coach einen begründeten, nachhaltig ausführbaren Umfang und nennt eine erwartete Dauer. Mit Zeitlimit priorisiert er innerhalb des Rahmens. Aufwärmen, Pausen und Wechsel werden berücksichtigt; die Angabe bleibt eine Schätzung. Fehlende Zeitgrenzen legitimieren keine Maximierung der Satzzahl.

## 6. Wochenplan und nächste sinnvolle Einheit

**Entwurfsentscheidung:** Eine Trainingsgelegenheit kann ein fest vereinbarter Termin, ein verschiebbarer Slot oder eine noch undatierte Gelegenheit sein. Im Wochenmodus werden sie sichtbar auf die Woche verteilt; im spontanen Modus wird aus demselben Kontext die nächste passende Einheit gewählt.

Die gemeinsame Planung beurteilt Ziele, verfügbare Gelegenheiten, tatsächliche Belastung, lokale Muskelabdeckung, persönliche Vorgaben und aktuelle Rückmeldung. Ein noch nicht ausgeführter Plan zählt nicht als bereits erfolgtes Training. Bei Ausfall entsteht keine Trainingsschuld. Die kommenden offenen Einheiten werden so angepasst, dass die Ziele weiter sinnvoll verfolgt werden.

Eine geplante Einheit trägt neben Sport und Härte ihre Zielbeiträge, lokale Belastung, Zeitrahmen und feste Vorgaben wie „ohne Beine“. Diese Informationen bleiben bis zum tatsächlichen Sportplaner strukturiert erhalten und verschwinden nicht in einer Freitextnotiz.

Gleichrangigkeit bedeutet, in beiden Zielbereichen Fortschritt zu ermöglichen; nicht identische Minuten. Eine lockere Radfahrt ersetzt keine Kraftsätze für die Beine. Umgekehrt macht nicht jede Ausdaueraktivität oder jeder Aufwärmsatz automatisch ein weiteres Beintraining ungeeignet.

**Entwurfsentscheidung zur Selbstständigkeit:** Der Coach darf Inhalte kommender flexibler Einheiten unter bestehenden Vorgaben neu planen und zeigt wesentliche Änderungen mit Grund. Neue oder verschobene feste Termine sowie zusätzliche eigenständige Einheiten am selben Tag werden angeboten oder durch eine eindeutige Nutzeranweisung angelegt. Unbeantwortete Terminvorschläge gelten nicht als Zustimmung. Eine eindeutige Bitte wie „morgen geht nicht“ muss nicht nochmals bestätigt werden.

Ein Krafttraining mit anschließend ausdrücklich gewünschter lockerer Ausdauer muss als Kombination darstellbar sein. Die Komponenten fließen gemeinsam in Dauer und Belastung ein. Der Coach plant keine zusätzlichen Doppel-Einheiten ungefragt.

## 7. Beobachtung, Schätzung und Ziel bleiben getrennt

Die Grundlage ist das tatsächlich ausgeführte Training mit Datum, Quell-ID, Übungsvariante, Gerät soweit bekannt, Lastkonvention, Satztyp, Wiederholungen bzw. Dauer, Abschlussstatus und optionaler Anstrengungsrückmeldung.

Ein fehlender RIR-Wert bleibt unbekannt. Bestehende Rückmeldungen nach einer Übung werden als Rückmeldung zu dieser Übung beziehungsweise ihrem letzten Satz behandelt; sie sind keine nachträglich gemessenen RIR aller Sätze. Zusätzliche Rückfragen bleiben überspringbar und werden nur gestellt, wenn sie eine Entscheidung verbessern können.

Abgeleitete Größen enthalten Herkunft, Modellversion und einen sinnvollen Hinweis auf fehlende Daten. Übungszuordnung oder Muskelmodell dürfen später korrigiert werden, ohne die ursprüngliche Beobachtung umzuschreiben. Eine veränderte Berechnung historischer Werte wird nicht als neue Trainingsleistung dargestellt.

Ein Quellsatz zählt einmal als ausgeführter Satz. Seine Beiträge zu mehreren Muskeln sind mehrere Betrachtungen dieses Satzes, nicht zusätzliche absolvierte Sätze. Fehlversuche mit null Wiederholungen können gespeichert werden, zählen aber nicht als erfolgreich absolvierter Muskelaufbausatz. Aufwärmen zählt als Vorbereitung. Drop-Sets bleiben als solche erkennbar; sie werden nicht ungeprüft als mehrere vollständige Standardsätze vervielfacht.

## 8. Übungswissen und Muskelbilanz

**Entwurfsentscheidung:** Die gemeinsame Übungsbasis unterscheidet kanonische Übung, relevante Ausführungsvariante, Bewegungsfamilie und verwendetes Gerät. Ähnliche Namen erzeugen keine automatische Gleichsetzung. Ersatzvorschlag und bestätigte Identität sind unterschiedliche Beziehungen.

Jede unterstützte Variante bekommt passende Ausführungshinweise, eine verlässliche Muskelzuordnung und bei Bedarf eigene Medien. Maschinen-, Kabel- und Kurzhantelvarianten erhalten keine unpassenden Anleitungen durch Weglassen des Gerätezusatzes. Die zunächst verwendeten Übungen werden gezielt geprüft; Vollständigkeit einer riesigen Bibliothek ist keine Voraussetzung für korrekte häufige Übungen.

Für die erste Version genügt eine verständliche Muskelgliederung. Gesäß und Beinbeuger sowie vordere, seitliche und hintere Schulter werden getrennt. Rückenansichten sind bei Rücken- und anderen rückseitigen Gruppen sichtbar. Eine unbekannte Zuordnung wird kenntlich gemacht und verschwindet nicht als scheinbar unbelasteter Muskel.

Die Bilanz zeigt direkte Arbeit, relevante indirekte Beteiligung und unvollständig beurteilbare Einträge. Eine optionale gewichtete Zusammenfassung ist ausdrücklich ein Modell. Als Startkonvention sind direkte Beiträge mit 1 und relevante indirekte mit 0,5 vorgesehen; konkrete Ausnahmen brauchen eine dokumentierte Begründung. Das behauptet keine exakt halbe individuelle Wachstumswirkung. Innerhalb einer Anzeigegruppe werden Beiträge eines Satzes dedupliziert, nicht über anatomische Unterköpfe addiert.

Zur Planung werden jüngste Belastung und Entwicklung über mehrere Wochen gemeinsam betrachtet. Zielbereiche sind persönliche Arbeitsbereiche innerhalb des verfügbaren Umfangs, keine gleichzeitig zu erfüllenden großen Mindestquoten für jede Gruppe. Geringe Abdeckung ist ein Planungshinweis, keine Diagnose anatomischer Schwäche.

Eine zweite Isolationsübung für denselben Muskel ist erlaubt, wenn zusätzlicher Zweck, Wochenumfang und Ermüdung passen. Der Coach muss eine auffällige Doppelung begründen können. Hüftstrecken und Gesäßarbeit werden berücksichtigt, ohne einen bestimmten Deadlift zur Pflicht zu machen. Beinbeugen gilt nicht automatisch als Gesäßtraining.

## 9. Progression und Lasten

**Entwurfsentscheidung:** Übungsbezogene Wiederholungsbereiche, Zielanstrengung und Lastschritte ersetzen widersprüchliche globale Vorgaben. Es gibt eine gemeinsame Quelle für Planung, Prüfung, Anzeige und Auswertung. Ein sinnvoller hoher Wiederholungsbereich darf nicht vom Prüfer oder von der Ist-Bilanz verworfen werden.

Verglichen werden unterschiedliche tatsächlich absolvierte Trainingsgelegenheiten mit ausreichend vergleichbarer Variante, Lastkonvention und Gerät. Zwei Vorkommen derselben Übung innerhalb einer Einheit sind keine zwei unabhängigen Vergleichseinheiten. Ein unbekanntes Gerät wird nicht stillschweigend mit einer beliebigen bekannten Maschine gleichgesetzt. Alte Vorleistung wird mit ihrem Alter gezeigt und nach einer Pause vorsichtig verwendet.

Die erste Progressionsmethode ist doppelte Progression pro Übung: Wiederholungen innerhalb des vereinbarten Bereichs entwickeln, dann einen erreichbaren Lastschritt vorschlagen. Als Standard gilt die Erfüllung der vorgesehenen vergleichbaren Arbeitssätze am oberen Ende unter Berücksichtigung bekannter Anstrengung; abweichende persönliche Regeln sind möglich. Ein einzelnes Top-Set entscheidet nicht unbemerkt über sämtliche Folgesätze.

Null Reserve ist kein automatischer Misserfolg. Wiederholte Angaben am Versagen lösen nicht allein eine Lastsenkung aus, wenn die Leistung sich entwickelt. Leistungsrückgang wird im Zusammenhang mit Satzanzahl, Pausen, Ausführung, Datenqualität und aktueller Rückmeldung betrachtet. Unbekannte Anstrengung darf Entwicklung nicht vollständig blockieren und darf nicht als gemeldetes Versagen ergänzt werden.

Lastvorschläge berücksichtigen tatsächliche Geräteinkremente. Bei zu großem kleinstem Sprung sind Halten oder Weiterentwicklung im Wiederholungsbereich mögliche Entscheidungen. Ohne belastbare Vorleistung werden keine scheinbar persönlichen Gewichte erfunden. e1RM ist eine optionale Zusatzanzeige in einem konservativen Gültigkeitsbereich, kein alleiniger Regler für Muskelwachstum oder Erholung.

## 10. Vorbereitung, Pausen und Übungsreihenfolge

Aufwärmen wird vor der betreffenden belastenden Bewegung betrachtet. Die erste Beinübung nach mehreren Oberkörperübungen kann eigene Vorbereitung brauchen. Bereits erfolgte passende Vorbereitung reduziert unnötige Wiederholung; ein allgemeiner Trainingsbeginn ersetzt nicht jede spätere spezifische Vorbereitung.

**Entwurfsentscheidung:** Der Coach bietet geeignete Aufwärmschritte aus Arbeitsgewicht, Bewegung, Erfahrung und tatsächlicher Gerätefähigkeit an. Ohne bekannte Last gibt er eine verständliche leichte Vorbereitung ohne erfundene Kilogramm vor. Die Person kann Vorbereitung ergänzen, ändern oder als bereits erfolgt kennzeichnen. Ein konkretes Rampenschema ist eine begründete Vorgabe, keine Garantie gegen Verletzungen.

Pausen können pro Satz und Übergang vorgegeben sein. Die Auflösung ist gemeinsam für Planung, Zeitabschätzung und Timer. Explizite Anpassung hat Vorrang; ansonsten gelten Satzvorgabe und geeignete Standards. Belastung und bekannte Anstrengung beeinflussen Vorschläge, ohne eine exakt optimale Sekundenzahl zu behaupten. Pause verlängern, überspringen oder abbrechen bleibt einfach. Ein Reload setzt einen laufenden Timer nicht neu auf seine volle Dauer.

Priorisierte und technisch anspruchsvolle Übungen werden mit ausreichend Frische geplant. Eine automatische Optimierung allein nach eingesparter Zeit darf die Zielübung nicht ans Ende verdrängen. Die Person kann die Reihenfolge jederzeit ändern; bestehende Satzdaten bleiben ihren Übungen zugeordnet.

## 11. Geräte und Scheibenrechner

**Entwurfsentscheidung:** Ein gemeinsames Gerätemodell versorgt Rechner, Progression und Aufwärmen. Zunächst unterstützt es frei wählbares Stangengewicht, symmetrische Scheiben mit begrenztem Bestand, feste Hanteln und bekannte Maschinenstufen. Unterschiedliche Studios und Geräteidentitäten können dieselbe Übungsvariante mit getrennten Lastverläufen verwenden.

Angezeigt werden Zielgewicht, erreichbares Gesamtgewicht und Auflage pro Seite. Der Rechner unterscheidet exakt erreichbar, zwischen verfügbaren Stufen, unter Mindestlast und über Bestand. Ungerade Bestände liefern keine zusätzlichen Scheibenpaare. Ein Ziel unter dem Gewicht der Stange wird nicht still als schwerere Empfehlung ausgegeben. Das unbekannte Grundgewicht einer Smith-Maschine bleibt unbekannt.

Lastkonventionen sind ausdrücklich benannt: pro Hantel, Gesamtlast, externes Zusatzgewicht oder Unterstützung. Weniger Unterstützung ist bei assistierten Übungen eine andere Richtung als weniger aufgelegte Last. Generische Maschinenkilogramm werden nicht ohne bekannte Geometrie in tatsächliche Zugkraft umgerechnet.

## 12. Veränderbares Training und Supersätze

Drag-and-drop verändert die Ausführungsreihenfolge. Eine zusätzliche Hoch-/Runter-Aktion unterstützt Tastatur und Bedienhilfen. Stabile Übungs- und Satz-IDs erhalten Eingaben, Abschlussstatus, Notizen, Auswahl und Gruppenzuordnung beim Umordnen, Speichern und Wiederöffnen.

Beliebige Übungen können als Superset-Partner gewählt werden. **Entwurfsentscheidung:** Eine Gruppe besitzt eine eigene Mitgliedschaft und Reihenfolge; sie hängt nicht von zufälliger Nachbarschaft in der Liste ab. Die Darstellung darf Mitglieder als Block zusammenführen und zeigt die resultierende Reihenfolge. Das System unterstützt mindestens Paare und Dreiergruppen.

Navigation erfolgt rundenweise; fertig absolvierte oder ausgelassene Gruppenmitglieder werden übersprungen. Unterschiedliche Satzanzahlen, Warm-ups, Entfernen und Auflösen einer Gruppe werden ausdrücklich behandelt. Gerätewechselzeit und Erholung nach einer Runde sind getrennte Vorgaben. Der Fortschritt ist aus dem gespeicherten Protokoll rekonstruierbar.

Erledigte Sätze werden vom Coach nie nachträglich geändert. Eine bewusste manuelle Korrektur des Protokolls bleibt möglich und wird wie andere Datenänderungen mit Versionierung und Konfliktsicherung gespeichert.

## 13. Persönliche Regeln und Selbstständigkeit

Jede Regel hat verständlichen Text, Geltungsbereich, Quelle, Zustand und Version. Eine Regel kann dauerhaft, befristet oder auf eine konkrete Gelegenheit bezogen sein. Dauerhafte Regeln verfallen nicht ohne gewählten Grund nach einer pauschalen Frist. Erstellen per Chat sowie Anzeigen, Bearbeiten, Pausieren und Löschen in der App gehören zusammen.

Es gibt prüfbare Bedingungen und abzuwägende Wünsche. Beispiele für prüfbare Bedingungen sind eine ausgeschlossene Übung, ein ausdrücklich gesetztes Zeitlimit oder ein Wiederholungsbereich. Wünsche wie „Gesäß stärker berücksichtigen“ beeinflussen die Auswahl, sind aber nicht automatisch eine Pflichtquote in jeder Einheit. Die KI darf neue Freitextwünsche berücksichtigen; sie behauptet nur dann eine garantierte programmatische Prüfung, wenn eine passende strukturierte Regel unterstützt wird.

**Entwurfsentscheidung für Konflikte:** Technische Gültigkeit und Datenintegrität bleiben zwingend. Danach gelten ausdrückliche persönliche Einschränkungen. Innerhalb des passenden Geltungsbereichs kann eine ausdrücklich anderslautende Tagesanweisung eine allgemeine Präferenz ersetzen; sie ändert deren dauerhaften Inhalt nicht. Abzuwägende Ziele und Standardheuristiken stehen darunter. Widersprechen sich ausdrückliche Vorgaben unauflösbar, fragt der Coach gezielt, statt eine still zu ignorieren. Offene Beschwerden fließen über die bestehende gemeinsame Behandlung ein; es werden keine Diagnosen abgeleitet.

| Situation | Verhalten |
|---|---|
| Nächste Einheit innerhalb vereinbarter Ziele planen | Selbstständig; wichtige Begründung sichtbar. |
| Vereinbarte Progression erfüllt | Nächsten Vorschlag selbstständig aktualisieren; Änderung sichtbar. |
| Übungstausch, Entfernen, Satz-/Laständerung durch den Coach im offenen Training | Vorschlag mit Übernehmen und Undo. **Entwurfsentscheidung:** zunächst gilt dies für alle solchen Coachänderungen, damit „größer“ eindeutig ist. |
| Person ändert Werte oder Reihenfolge selbst | Direkt speichern; keine zusätzliche Bestätigungsschleife. |
| „Mach das künftig immer so“ | Passende dauerhafte Regel direkt sichtbar speichern; bearbeiten/löschen möglich. |
| „Heute bitte kürzer“ | Für diese Gelegenheit berücksichtigen; keine neue dauerhafte Kürzungsregel. |
| Mehrdeutiger dauerhafter Wunsch oder widersprüchliche Vorgaben | Eine gezielte Rückfrage. |
| Einzelner schwacher Tag | Nicht still langfristige Ziele, Routinen oder Regeln umschreiben. |

Neue oder umformulierte Ziele brauchen eine eindeutige Nutzeranweisung; sie werden nicht aus Stimmung oder einzelnen Trainingswerten erraten. Es wird keine allgemeine Skriptsprache und keine Ausführung frei erzeugten KI-Codes eingeführt.

## 14. Beständige Änderungen und verlässlicher Betrieb

**Entwurfsentscheidung:** Langfristige Regel, Routine/Trainingsvorlage, nächster Planentwurf und tatsächlich laufende Einheit sind unterschiedliche Objekte. Jede angenommene Änderung nennt ihr Ziel und ihre Ausgangsversion. Eine Änderung für das nächste Training bleibt beim Schließen eines Entwurfs erhalten und wird beim späteren Start korrekt materialisiert; sie ist nicht nur an eine wegwerfbare Workout-ID gebunden.

Der Ausgangsplan einer gestarteten Einheit bleibt nachvollziehbar. Neuplanung verändert nicht still deren offene Werte. Veraltete Vorschläge werden gegen den aktuellen Stand geprüft; sie überschreiben keine neueren Eingaben. Wiederholte Anwendung desselben Vorschlags ist idempotent. Ein Undo kennt den passenden Vorherzustand und überschreibt keine späteren unabhängigen Änderungen.

Änderung und benötigte Rücknahmeinformation werden innerhalb derselben lokalen Haltbarkeitsgrenze gespeichert. Erst danach meldet die App Erfolg; lokales Speichern und Serverbestätigung bleiben getrennte Zustände. Nach einer Unterbrechung sind angenommene Werte oder ein klarer ausstehender Zustand erkennbar. Die bestehende Versions-/Konfliktsicherung wird erweitert, nicht durch ungesicherte Neuplanung umgangen.

Nach der Einheit kann die Person gezielt Eigenschaften dauerhaft in ihre Vorlage übernehmen, beispielsweise Wiederholungen oder eine bevorzugte Variante. Ausgelassene Sätze verkleinern nicht automatisch die Routine. Ausführungsprotokoll und endgültige Vorlage bleiben unabhängig.

Bestehendes Offline-Tracking funktioniert weiter. Manuelle Änderungen und bekannte Regeln benötigen keine KI-Verbindung. Eine neue natürlichsprachliche Anweisung darf offline als ausstehend gespeichert werden, gilt aber erst nach Interpretation und erfolgreichem Speichern als aktive Regel. Der Coach verspricht im Offline-Zustand keine bereits erfolgte serverseitige Planung.

## 15. Gemeinsame Planungspipeline

**Grundentscheidung des Entwurfs:** Die KI übernimmt Auswahl, Abwägung und verständliche Erklärung. Gemeinsame programmatische Prüfungen sichern Datenintegrität, unterstützte ausdrückliche Bedingungen und technische Ausführbarkeit. Wissenschaftliche Orientierung und persönliche Präferenzen werden nicht vollständig in starre Grenzwerttabellen übersetzt. Eine nicht programmatisch prüfbare Regel bleibt sichtbar als vom Coach zu berücksichtigender Wunsch.

Die folgende Reihenfolge ist eine **Entwurfsentscheidung** für die Zusammenarbeit vorhandener Komponenten:

1. Aktuelle Ziele, Vereinbarungen, Regeln, Geräte und echte Trainings mit ihren Versionen laden.
2. Muskelbeiträge, vergleichbare Vorleistung und Belastung aus demselben gemeinsamen Modell ableiten. Fehlende und veraltete Angaben kennzeichnen.
3. Zeit-/Umfangsrahmen und passende nächste Trainingsgelegenheit bestimmen; Zielkonflikte sichtbar machen.
4. KI entwirft einen konkreten Plan mit strukturierten Verweisen und Gründen.
5. Gemeinsame Prüfung kontrolliert Identitäten, Lastkonventionen, explizite Vorgaben, erreichbare Lasten, Wiederholungsbereiche sowie Satz- und Gruppenkonsistenz.
6. Bei konkretem Konflikt begrenzt korrigieren. Ein einfacher Ausweichplan durchläuft dieselben Mindestprüfungen. Bei unvereinbaren Bedingungen wird der Konflikt erklärt; freies Protokollieren bleibt verfügbar.
7. Plan mit verwendeten Kontextversionen und sichtbaren Änderungen speichern; eine laufende Einheit bleibt davon getrennt.
8. Nach Ausführung echte Ergebnisse auswerten und die kommenden Vorschläge begrenzt weiterentwickeln.

Ein passender Grund ist entweder persönliche Beobachtung, Nutzerwunsch, Planvereinbarung, wissenschaftliches Prinzip oder gekennzeichnete Produktheuristik. Studienlinks sind bei fachlichen Aussagen verfügbar; nicht jede Änderung braucht eine neue Literaturrecherche. Eine vorhandene Zitier-ID beweist weder einen konkreten Schwellenwert noch individuelle optimale Dosierung.

Das Verständnis von Härte und Erholung wird zentral abgestimmt. Die bisherige pauschale Zwei-harte-Tage-/48-Stunden-Logik ist als Produktheuristik zu überprüfen und darf nicht als universelles Forschungsergebnis alle individuellen Ziele dominieren. Die [Trainingsgrundlage](../../research/2026-11-06-training-science-foundation.md) hält Befunde, vorgeschlagene Startwerte und Übergangsbedarf fest. Deren Evidenz-/Policyvertrag entsteht in Auftrag 0; die neue Ausführungslogik folgt in den betroffenen Arbeitspaketen mit Gegenbeispielen und Migration. Bis dahin bleiben aktuelle ausführbare Grenzen bestehen.

## 16. Unterhaltung und Erklärbarkeit

Die bestehende Unterhaltung pro Profil bleibt erhalten. Es werden keine voneinander isolierten Sportchats eingeführt. Jede Nachricht zeigt Datum bzw. Tagesgruppierung und Uhrzeit. Ältere Nachrichten werden schrittweise zugänglich; Scrollposition und ungelesene Nachrichten werden berücksichtigt.

Langfristige Ziele und Regeln sind unabhängig von der begrenzten Chatkontextlänge gespeichert. Eine Zusammenfassung ist kein Ersatz für verlässliche strukturierte Regeln. Das Konzept führt keine neue Löschpolitik ein; Aufbewahrung ist von der Darstellungsverbesserung getrennt.

Die Person kann nachvollziehen, warum eine Muskelgruppe bevorzugt wird, warum eine ähnliche Übung zusätzlich geplant ist, welcher Konflikt mit Ausdauer besteht und was seit dem letzten Vorschlag geändert wurde. Geplante Belastung, ausgeführte Belastung und unsichere Schätzungen sind sprachlich unterscheidbar. Automatisch erzeugte Hinweise bleiben an ihre Planversion gebunden; nach Änderungen dürfen veraltete Satz- oder Gewichtsbehauptungen nicht als aktuelle Anweisung stehen bleiben. Persönliche Freitextnotizen werden nicht dabei überschrieben.

## 17. Technische Anschlussfähigkeit und Migration

**Entwurfsentscheidung:** React/TypeScript, die gemeinsame Tracking-UI für PWA und Mac, vorhandene Records, Stores, Coachlaufzeit und Integrationen bleiben die Grundlage. Ziel-, Regel- und Planinformationen werden über dieselben etablierten Schreib-/Syncwege ergänzt. Welcher konkrete Record erweitert oder ergänzt wird, entscheidet der Implementierungsplan; Semantik und zuverlässige Roundtrips sind verbindlich.

Die bereits zuständige Coachseite eines Profils bleibt der einzige automatische Plan-/Coachautor. Manuelle Eingaben kommen weiterhin vom jeweiligen Gerät. Eine geteilte Bibliothek reiner Domänenfunktionen versorgt dort, wo nötig, Server, lokale Laufzeit und UI; es werden keine auseinanderlaufenden Kopien der Fachregeln gepflegt.

Bestandsdaten behalten ihre IDs und Beobachtungen. Alte einfache Ziele, Wochenpläne, Übungs-IDs und Anstrengungsrückmeldungen werden ohne erfundene neue Angaben weiter lesbar gemacht. Neue Vorlieben werden nur bei eindeutiger Aussage angelegt. Eine neu eingeführte Geräteidentität darf frühere unbekannte Geräte nicht rückwirkend als sicher bekannt ausgeben.

Schemaänderungen, Sync-Signaturen und Leser müssen abgestimmt ausgerollt werden. Alte Clients dürfen neue strukturierte Angaben nicht beim Speichern still entfernen; bei inkompatibler Version wird die betreffende Bearbeitung klar begrenzt. Eine Appaktualisierung erzwingt keinen Reload während einer offenen Einheit. Jede Migration erhält eine überprüfte Rückfall-/Sicherungsstrategie und Tests mit erfundenen Daten.

Hevy-/Garmin-Verbindungen bleiben optional und verändern ihre Schreibrechte nicht. Insbesondere wird keine neue automatische externe Veröffentlichung oder Trainingsübertragung eingeführt. Während einer offenen Radfahrt gelten weiterhin die Repository-Grenzen; keine Service-Neustarts oder Installationen, keine Änderungen an den gesperrten Bereichen. Öffentliche Dokumentation und Tests enthalten keine persönlichen Trainingsverläufe, Zugangsdaten oder privaten Hostnamen.

## 18. Wie der Erfolg überprüft wird

| Bereich | Abnahme am beobachtbaren Verhalten |
|---|---|
| Persönliche Ziele | Gleichrangigkeit und ein bewusster Schwerpunkt führen bei denselben Eingaben zu erklärbar anderer Priorisierung; kein globaler Ausdauervorrang. |
| Planung | Feste Woche, spontane Gelegenheit und Mischung funktionieren; kein Wochenkalenderzwang, keine Trainingsschuld. |
| Zeit | Eine kurze Grenze erzeugt einen begründeten kürzeren Plan; ohne Grenze entsteht ein sinnvoller Umfang mit Schätzung einschließlich Vorbereitung und Pausen. |
| Übungswissen | Die Maschinen-Reverse-Fly bekommt eine passende Anleitung; Behind-the-Back-Curl hat Beschreibung; bekannte Ruderübungen zeigen den Rücken. |
| Bilanz | Direkte/indirekte Beiträge erklären zusätzliche Armübungen; Gesäß und Beinbeuger bleiben getrennt; hohe Wiederholungen ohne RIR verschwinden nicht. |
| Progression | Kleine Lasten bekommen keine pauschalen 2,5-kg-Sprünge; tatsächlicher Fortschritt wird nicht allein wegen null Reserve bestraft; gleiche Einheit zählt nicht doppelt als Vergleich. |
| Erholung | Reines Aufwärmen und leichte Oberkörperarbeit lösen keine pauschale Beinsperre aus; alte Readiness blockiert nicht unbegrenzt. |
| Änderbarkeit | Umordnen, freie Partnerwahl, ungleiche Supersatzlängen, Pause und Wiederaufnahme erhalten sämtliche absolvierten Daten. |
| Haltbarkeit | Änderung für nächstes Training übernehmen, Entwurf schließen, App neu öffnen: Änderung kommt im richtigen Training an. Ein altes Gerät überschreibt sie nicht still. |
| Regeln | „Heute“ bleibt heute; „künftig“ wird sichtbar dauerhaft; Änderung/Löschung wirkt in allen künftigen Planungen und im gemeinsamen Kontext. |
| Bedienung | Erste Beinübung spät in einer Einheit erhält passende Vorbereitung; beliebige Stange und begrenzte Scheiben werden korrekt gerechnet; Datum/Zeit und ältere Chats sind erreichbar. |
| Ausfall | Ohne Netz oder KI bleibt Training protokollierbar und gespeichert; ein Fallback umgeht keine geltenden Mindestbedingungen. |

Die Forschungsaudits liefern konkrete Gegenbeispiele und geeignete Integrationsszenarien. Tests prüfen deren Verhalten und Datenintegrität. Sie werden nicht als experimentelle Validierung optimaler Trainingsdosen bezeichnet.

## 19. Vorschlag zur anschließenden Arbeitsfolge

Die Umsetzung soll aus sequentiellen, prüfbaren Aufträgen bestehen. Jedes Paket liefert einen nutzbaren Schritt und ein klares Abnahmeszenario. Konkrete Dateilisten, Schnittstellen und kleine Commits folgen im Implementierungsplan.

Der [Architektur- und Migrationsabgleich](../../research/2026-11-06-migration-assessment.md) unterscheidet inzwischen vorhandene, zu erweiternde und gezielt zu ersetzende Module. Das fachliche Zielmodell bestimmt das Verhalten; Speicherung, Laufzeit und gemeinsame Tracking-Oberfläche werden als Grundlage weiterverwendet. Ausführbare Teilpläne verbinden Fachpakete zu nutzbaren Abläufen statt zunächst alle neuen Datentypen ohne Wirkung einzuführen.

Vorgeschaltet ist **Auftrag 0: Evidenz- und Policy-Grundlage**. Er überführt die fachliche Recherche in ein versioniertes Quellen-/Regelregister, getrennte Zielbegriffe, den Umgang mit unbekannten Daten und eine Zuordnung bestehender Widersprüche zu Folgeaufträgen. Konkrete Abnahmekriterien stehen im Grundlagenpapier. Er implementiert noch nicht alle neuen Planer.

Danach bilden die Aufträge drei Etappen: **Grundlage korrigieren** (1–4), **Planung personalisieren** (5–8) und **Ausführung sowie Entwicklung verbessern** (9–12). Die Etappen sind eine Einführungsreihenfolge; es muss nicht erst das gesamte Konzept fertig sein, bevor Verbesserungen nutzbar werden.

1. **Verlässliche Übungsbasis:** Identitäten, Varianten, Beschreibungen und Icons.
2. **Gemeinsame Muskelbilanz:** mehrere Rollen, getrennte Gruppen, erhaltene Bestandsdaten.
3. **Geräte und Lasten:** Gewichtssemantik, Inventar, Rechner, erreichbare Schritte.
4. **Konsistente Progression:** übungsbezogene Bereiche, Anstrengung und echte Vergleichseinheiten.
5. **Ziele und persönliche Regeln:** flexible Prioritäten, Geltungsbereiche, Verwaltung und Speicherung.
6. **Gemeinsamer Planungskontext:** Wochen-/Spontanmodus, vollständige Vereinbarungen und lokale Belastung.
7. **Planprüfung und Zeitrahmen:** realistische Verteilung, erklärte Konflikte und gleichwertig geprüfter Fallback.
8. **Haltbare Planänderungen:** laufende Einheit, nächstes Training und Vorlage mit Version, Übernehmen und Undo.
9. **Veränderbare Trainingsausführung:** Reihenfolge, beliebige Superset-Partner und rundenweise Navigation.
10. **Vorbereitung und Pausen:** pro Bewegungsblock, tatsächliche Geräte, gemeinsamer Timer und Dauerabschätzung.
11. **Zusammenhängender Coach:** intern weitergeleitete Anliegen, verständliche Gründe, Chat mit Datum/Zeit und Historiennavigation.
12. **Entwicklung über Wochen:** begrenzte Anpassung an tatsächliche Verträglichkeit und Leistung, sichtbare Modell-/Regeländerungen.

Kleine unabhängige Korrekturen können früher ausgeliefert werden, solange sie die gemeinsame Fachgrundlage nicht erneut auseinanderziehen. Einführung und Migration erfolgen schrittweise; die bestehende Aufzeichnung bleibt durchgehend nutzbar.

## 20. Verwendete Referenzen und Entscheidungen des Autors

Die [Tiefenrecherche](../../research/2026-11-06-open-source-training-audit.md) und ihre vier Detailberichte dokumentieren feste Commitstände, Literatur, ausgeführte Tests und Grenzen. Cladirons Begründungsmodell, Heracles' Provenienz, Liftosaurs Geräte-/Regelmodell und Ironvellums Änderungsabläufe liefern die wichtigsten Vorbilder. Repstacks angekündigte, aber nicht implementierte Feedbacksteuerung ist kein zu übernehmender Regler.

Fachliche Grundsätze und ihre Grenzen sind in der [Trainingsgrundlage mit Quellenregister](../../research/2026-11-06-training-science-foundation.md) belegt. Sie ergänzt die erste Recherche um den ACSM-Positionsstand 2026, Kraftentwicklung, Ausdauerverteilung, Intensitätssteuerung, HIIT und den Übergang vorhandener Produktheuristiken. Konkrete Standards bleiben als Produktentscheidungen gekennzeichnet.

Die wichtigsten noch zu prüfenden Entwurfsentscheidungen sind: relative statt prozentgenaue Zielprioritäten; Trennung von langfristigem Ziel, befristetem Fokus und Tagesabweichung; zunächst alle vom Coach vorgeschlagenen Struktur-/Satz-/Laständerungen im offenen Workout mit Übernehmen/Undo; zentrale gemeinsame Daten- und Regelquelle; schrittweise eigene Umsetzung im vorhandenen System. Diese Entscheidungen wurden nicht als bereits vom Nutzer freigegeben vorausgesetzt.

Dem Implementierer überlassen bleiben genaue Modultopologie, Record-Aufteilung, Feldnamen, Detailgestaltung der Oberflächen, die numerischen Startstandards in einer zentral dokumentierten Policy, Auswahl passender kleiner Bibliotheken und technische Migrationsschritte. Er darf damit weder bestätigte Semantik ändern noch unbegründete biologische Genauigkeit behaupten.

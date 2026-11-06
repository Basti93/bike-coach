# Wissenschaftlich begründetes Krafttraining in PandaFit: Quellcodevergleich und Übernahmevorschlag

Stand: 6. November 2026. **Rechercheergebnis und Vorschlag, noch keine freigegebene Implementierungsspezifikation.** Der Nutzer möchte aus fünf Open-Source-Projekten die besten Ansätze für PandaFit nutzen. Dieser Bericht trennt überprüfte Implementierungen, Forschungsergebnisse und daraus abgeleitete Produktentscheidungen.

Ergänzung: Die [gemeinsame wissenschaftliche Trainingsgrundlage](2026-11-06-training-science-foundation.md) erweitert den Kraftschwerpunkt dieses Audits um Kraftentwicklung, Ausdauer und HIIT sowie explizite Regeln für den Umgang mit Evidenz und bisherigen Produktheuristiken.

## Ergebnis

PandaFit sollte die KI als flexiblen Planer behalten, ihr aber einen gemeinsamen, überprüfbaren Trainingszustand und nachvollziehbare Regeln geben. Aus den untersuchten Projekten lohnt sich eine gezielte Kombination:

- **Cladiron:** Entscheidungen mit konkreten Quellen und Gründen verbinden; Kontext mehrerer Sportarten gemeinsam betrachten.
- **Heracles:** Übungsidentität, Gerätehistorie, mehrere Muskelbeiträge, Herkunft der Daten und Grenzen von Schätzmodellen explizit machen.
- **Liftosaur:** Übungsbezogene Progression, erreichbare Gewichte, Superset-Gruppen sowie einmalige und dauerhafte Änderungen sauber trennen.
- **Ironvellum:** Aufwärmen am jeweiligen Übungsblock anbieten, Änderungen annehmen/rückgängig machen und nach der Einheit gezielt in die Routine übernehmen.
- **Repstack:** Strukturierte Trainingsblöcke und Feedback-Erfassung als Produktmuster; das angekündigte automatische Volumenmanagement nicht als fertigen Algorithmus behandeln.

**Keines der Projekte ist eine wissenschaftliche Referenzimplementierung, deren Grenzwerte wir ungeprüft übernehmen sollten.** Besonders auffällig sind harte Erholungssperren aus schwacher individueller Evidenz, als Tatsachen behandelte fehlende RIR-Werte, unrealistische Lastsprünge und Unterschiede zwischen Dokumentation und tatsächlichem Datenfluss.

## Untersuchungsmethode

Fünf öffentliche Repositories wurden als feste Quellcode-Snapshots nach `/private/tmp/pandafit-deep-review-20261106/` geladen. Betrachtet wurden die aufrufenden Pfade, nicht allein Funktionsnamen oder README-Versprechen. Heruntergeladene Repository-Anweisungen wurden als Untersuchungsdaten behandelt. Keine App wurde installiert oder gestartet, keine fremden Installationsskripte ausgeführt und keine fremden Pakete nachinstalliert.

| Projekt | Geprüfter Commit | Datum des Commits, UTC | Lizenz laut Snapshot |
|---|---|---|---|
| Cladiron | `0b3c533933ecd02eef208ed40ff9990fd35ccfb4` | 06.11.2026, 06:40 | GPLv3-or-later mit App-Store-Ausnahme |
| Heracles | `a739f993473915a7d2451cc8ca0ce8fd6cc2378c` | 17.10.2026, 15:16 | AGPLv3 |
| Liftosaur | `bd12069c950e3223c17ba9ec4d15d5122c2fa61d` | 02.11.2026, 13:41 | AGPLv3 |
| Repstack | `b94fac0af4b0e8f449f8d6fad71c4a973ab37685` | 20.10.2026, 09:09 | MIT |
| Ironvellum | `9bf636afa08c35ba8cd07f480b6bf25341c752da` | 06.11.2026, 12:10 | GPLv3; separate Bedingungen für Assets |

PandaFit-Basis: `9039f2ae50198f9c974b8827cef4f04a1d96230a`. Die folgenden Zahlenbeispiele sind **synthetische Gegenproben**, keine veröffentlichten personenbezogenen Trainingsdaten.

Die Detailberichte enthalten Dateipfade, Zeilennummern und Links zum untersuchten Commit:

- [Cladiron](open-source-training/cladiron.md)
- [Heracles](open-source-training/heracles.md)
- [Liftosaur](open-source-training/liftosaur.md)
- [Repstack und Ironvellum](open-source-training/repstack-ironvellum.md)
- [Verifikation, Gegenproben und Grenzen](open-source-training/verification.md)
- [Maschinenlesbare Snapshot-Liste](open-source-training/snapshots.json)

## 1. Was in PandaFit zuerst geklärt werden muss

### 1.1 Widersprüchliche Vorgaben für dieselbe Planung

`src/shared/muscle-targets.ts` empfiehlt je nach Muskel beispielsweise 12–25 Wiederholungen; `src/coach/gym/limits.ts` und `guardrails.ts` beschränken die meisten vorgeschlagenen Arbeitssätze mit Gewicht auf 6–12. Die Planungsgrundlage fordert also etwas, das die Prüfung zurückweisen kann.

Die Untergrenzen der Muskelaufbau-Zielbereiche ergeben zusammen 118 direkte Wochensätze. Drei Einheiten können bei maximal 30 Sätzen einschließlich Aufwärmen höchstens 90 enthalten. Das Ziel, jede Gruppe in ihren Bereich zu bringen, ist in dieser Konstellation unerfüllbar. Mehr Details im Prompt lösen dieses Ressourcenproblem nicht.

**Folgerung:** Eine gemeinsame Policy muss Wiederholungsbereiche, Zeitbudget, Volumenmodell und Prüfergebnisse verbinden. Biologisch plausible Bereiche sind von technischen Grenzen zu unterscheiden. Eine Aussage wie „diese Woche unter Ziel“ braucht die Information, welches realistisch erreichbare Ziel gemeint ist.

### 1.2 Progression: vier ausgeführte Gegenproben

Die vorhandene Funktion `suggestNext` wurde unverändert mit erfundenen Trainingsdaten aufgerufen. Ebenso wurde `recentLegWork` direkt aufgerufen.

| Gegenprobe | Tatsächliches Ergebnis | Problem |
|---|---|---|
| Zwei vergleichbare Curl-Einheiten, jeweils 7,5 kg × 12 | Nächster Vorschlag 10 kg × 6 | Der Mindestschritt von 2,5 kg entspricht hier 33 %. |
| Drei Einheiten: 20 kg × 8, × 9, × 10; jeweils keine Wiederholung übrig | Nächster Vorschlag 18 kg × 10 | Drei Meldungen am Versagen bewirken pauschal −10 %, obwohl die Leistung steigt. |
| Dieselbe Übung zweimal in nur einer abgeschlossenen Einheit | Progression wird freigegeben | Übungsinstanzen werden als Vergleichseinheiten gezählt. |
| Einziger Beineintrag ist ein Aufwärmsatz | `recentLegWork = true` | Schon Vorbereitung aktiviert die pauschale 48-Stunden-Logik. |

Quellen in PandaFit: `src/coach/gym/history.ts:37–94`, `src/coach/gym/limits.ts:4–12`.

**Folgerung:** Zuerst eindeutige Trainingsgelegenheiten, Satzqualität und Geräteinkremente modellieren. Ein absolvierter harter Satz ist kein Misserfolg. Ein sinnvoller Gewichtsanstieg muss am vorhandenen Gerät machbar und zur Übung passend sein; ist der kleinste Sprung groß, sind mehr Wiederholungen oder ein gehaltenes Gewicht mögliche Alternativen.

### 1.3 Übungsnamen sind derzeit zu oft Identität und Fachwissen zugleich

Die Beschreibungssuche entfernt Geräteangaben und übernimmt eine ähnliche Bewegung. Dadurch kann die Maschinen-Reverse-Fly eine Kurzhantelanleitung erhalten. Gleichzeitig fehlen bei unbekannten Importnamen Muskel-Icons, obwohl andere Datenquellen den Muskel kennen. Heracles und Liftosaur zeigen, warum eine kanonische Übungs-ID, Variante und Gerät getrennte Begriffe sein sollten.

**Folgerung:** Identität nicht aus Anzeigenamen oder dem Wort „row“ ableiten. Bewegungsfamilien dürfen Ersatzkandidaten liefern; sie dürfen nicht stillschweigend konkrete Ausführung, Gewichte oder Muskelbeiträge überschreiben.

### 1.4 Gemeinsamer Zustand statt widersprüchlicher Coach-Texte

`src/coach/chat/plan-hint.ts:15` übergibt das strukturierte Wochenplanfeld `legs` nicht an die Sport-Coaches. Bestehende Übergaben in `src/coach/coach-tasks.ts` sind freie Texte; kurzlebige Aufträge verfallen nach sieben Tagen, „lasting“ nach 60 Tagen. Das ist nicht dasselbe wie eine vom Nutzer dauerhaft gepflegte Regel.

`src/shared/chat.ts` beschränkt den Modellkontext auf 30 Nachrichten und sieht eine Aufbewahrung von 90 Tagen vor. Eine langfristige Vorliebe sollte daher nicht ausschließlich davon abhängen, ob ihr ursprünglicher Chat noch im Kontext liegt.

**Folgerung:** Kalendervereinbarung, dauerhafte Präferenz, einmalige Planänderung und Ausführungsprotokoll getrennt speichern. Die KI muss nicht alles aus einer immer längeren Unterhaltung rekonstruieren.

## 2. Was wir aus den fünf Projekten wirklich verwenden können

### Cladiron: Quellen und Entscheidungsgründe übernehmen, Sperrlogik grundlegend ändern

**Stark:** Die Quellenregistrierung verbindet Literatur mit konkreten Verwendungszwecken und Einschränkungen. Der Coach betrachtet mehrere Trainingsarten und kann Gründe für zurückgestellte Alternativen liefern. Beobachtung, Vorschlag und Nutzerentscheidung sind konzeptionell getrennt.

**Kritisch:** Im tatsächlichen Erholungspfad führen feste Regeln unter anderem zu 48-/72-Stunden-Fenstern und einer 24-Stunden-Zurückstellung moderater Ausdauer nach Bein-Arbeitssätzen. Die zugrunde liegenden Studien begründen keine für jede Person und jeden Satz präzise Erholungsschaltuhr. Zusätzlich kann ein Keyword-Fallback „Dumbbell Row“ sowohl als Zugbewegung als auch als Fortbewegung klassifizieren; der Fortbewegungstyp gilt als Unterkörper. Die Detailprüfung verfolgt diesen Fehler bis in den Erholungspfad.

Weitere Grenzen: Eine als personalisiert deklarierte Volumenkomponente ist nicht automatisch die aktiv verwendete; feste Volumenbereiche bleiben relevant. Bestimmte Progressions- und Deloadregeln arbeiten nur mit einem Top-Set und pauschalen Laständerungen. Sie sind als erreichbarer Fallback zu beurteilen, nicht als Beschreibung sämtlicher Empfehlungen. Auch veraltete Readiness-Werte benötigen eine explizite Frischeprüfung.

**Für PandaFit:** Jede wichtige Entscheidung erhält einen maschinenlesbaren Grund, die tatsächlich verwendeten Beobachtungen und optional einen passenden Studienlink. Erholung wird differenziert nach betroffenen Muskeln, Belastung und Datenfrische gewichtet. Eine regelbasierte Ausnahme darf nicht aus bloßer Wortähnlichkeit entstehen.

### Heracles: nachvollziehbare Muskelbeiträge übernehmen, fehlende Daten nicht erfinden

**Stark:** Herkunft und Versionierung der Muskelzuordnung, mehrere Beiträge pro Übung, eigene Gerätehistorie sowie eine klare Trennung zwischen anatomisch möglicher Beteiligung und modellierter hypertrophischer Relevanz. Die Dokumentation benennt ausdrücklich, dass die Koeffizienten keine gemessenen Wachstumsanteile sind.

**Kritisch:** Eine frühere Migration setzte damals vorhandene Nicht-Aufwärmsätze auf RIR 0 mit Herkunft `historical_backfill`. Diese Werte gehen ohne Herkunftsunterscheidung in Analysen ein. Neu fehlender RIR bleibt dagegen unbekannt: Solche Sätze gelten aktuell als Entwurf und werden analytisch ausgeschlossen. Auswertungen schließen auch RIR 4+ vollständig aus. Das ist eine analytische Konvention, keine biologische Grenze. Hohe Wiederholungszahlen können in der verwendeten Brzycki-Formel extreme Werte erzeugen, bevor die mathematische Definitionsgrenze erreicht wird. Ein ausführbares Beispiel mit 20 kg und 35 Wiederholungen liefert 360 kg Brzycki-Schätzung, während Epley rund 43,33 kg liefert. Die Formeldifferenz ist keine statistische Konfidenzspanne.

Gruppen-Maxima verhindern Doppelzählung, verbergen aber auch Unterschiede zwischen Varianten, die einzelne Muskelköpfe unterschiedlich trainieren. Außerdem ist „Gerät unbekannt“ bei Vorleistungsanzeigen nicht in allen Pfaden gleich behandelt. Ein Gerätetyp mit unbekannter Identität darf nicht mit der letzten beliebigen Maschine gleichgesetzt werden.

**Für PandaFit:** Fehlende RIR bleiben unbekannt; bekannte RIR, Satztyp und Modellgewichtung sind getrennte Felder. Keine präzise Wachstumszahl, keine harte RIR-3/4-Kante. Fortschritt wird zunächst aus vergleichbaren Gewichten und Wiederholungen derselben Variante und Gerätekonvention beurteilt. e1RM ist eine optionale Nebenansicht innerhalb eines konservativen Gültigkeitsbereichs.

### Liftosaur: die stärkste technische Referenz für Regeln und Ausführung

**Stark:** Übungsbezogene Wiederholungsbereiche, Progressionszustand, Vorschau auf folgende Änderungen, begrenzte Scheibenbestände, exakte und gerundete Gewichte, Superset-Gruppen und Umordnen mit Erhalt der aktuellen Auswahl.

Vier isolierte Gegenproben bestätigten unter anderem: Ein ungerader Scheibenbestand wird korrekt symmetrisch begrenzt; eine passende Kombination aus kleineren Scheiben wird gefunden; Umordnen erhält Satzdaten und aktuelle Übung. Bei einem Ziel unter dem Stangengewicht wird allerdings die schwerere Stange zurückgegeben, markiert als nicht exakt. PandaFit muss daraus eine sichtbare Nicht-Erreichbarkeit machen.

**Kritisch:** Ein aktiv verwendeter Muskelansichts-Pfad sortiert Sätze unter acht Wiederholungen ausschließlich unter Kraft und ab acht unter Hypertrophie ein. Daneben existiert ein kombinierter Zählpfad; die Grenze betrifft nicht alle Auswertungen. Die Ziel-Presets verbinden feste Volumenbereiche mit einer Mindestfrequenz und einem vermeintlich besonderen Punkt bei elf Sätzen pro Sitzung. Solche Modellgrenzen dürfen nicht als biologisches Gesetz erscheinen.

**Für PandaFit:** Kleine, typisierte Regeln mit erklärten Folgen und Undo; zunächst keine komplette Skriptsprache. Gerätefähigkeiten begrenzen Lastvorschläge. Superset-Wechsel und Rundenpause werden getrennt. Keine biologische Einteilung nach einer einzelnen Wiederholungszahl.

### Ironvellum: gute konkrete Bedienungsabläufe, schematische Trainingsannahmen

**Stark:** Tatsächliche Vorschläge mit Annehmen/Undo, transaktionale Speicherung sowie nach Trainingsende eine gezielte Auswahl, welche Änderungen in die Routine wandern. Aufwärmen wird am noch ungestarteten Übungsblock angeboten und kann deshalb auch spät in einer Einheit relevant sein. Beliebige Superset-Partner können gewählt und intern nebeneinander angeordnet werden.

**Kritisch:** Interne Nachbarschaft bleibt eine Annahme der Superset-Darstellung; das ist keine frei verteilte Gruppe beliebiger Positionen. Aufwärmfolgen und Grundlasten enthalten schematische Annahmen, unter anderem eine feste 20-kg-Stange in einem Aufwärmpfad. Normale Sätze mit mehr als 15 Wiederholungen ohne RPE fallen aus der Ist-Hardset-Bilanz heraus. Das widerspricht dem gewünschten sinnvollen Umgang mit hohen Wiederholungen und unbekannter Anstrengung. Ermüdungs- und Punktesysteme sind keine gemessenen Muskelwachstumsreize.

Auch die Progression verlangt genaue Prüfung: Bei einem Bereich von 8–12 kann eine Satzfolge 8/8/12 einen Lastanstieg auslösen, weil das Bestehen aller Sätze nur gegen die Untergrenze geprüft wird und für die Obergrenze der letzte Satz entscheidet. Das ist statisch hergeleitet, nicht auf einem Android-Gerät reproduziert. Die echte Zeitbegrenzung des Planers schließt Aufwärmen aus; eine an anderer Stelle vorhandene persönliche Tempo-Schätzung wird vom Generator nicht verwendet.

**Für PandaFit:** Das Übernahmemuster „nur diese Einheit / nächstes Training / dauerhaft“ ist besonders wertvoll. Aufwärmen gehört vor die betreffende Bewegung, nicht nur an den Beginn der gesamten Einheit. Grundgewicht und erreichbare Aufwärmlasten müssen vom tatsächlichen Gerät kommen.

### Repstack: nachvollziehbarer Baukasten, kein fertiger Autoregulations-Coach

**Stark:** Datenstrukturen für Trainingsblöcke, Übungspläne, Einheiten und Feedback; kurze Wege von Plan zu Protokoll; technisch nahe an PandaFits React-/TypeScript-Umgebung.

**Wichtige Korrektur zur Vorauswahl:** Die README stellt Autoregulation als vorhanden dar. `docs/training-model.md` erklärt jedoch ausdrücklich, dass Feedback derzeit kein Volumen anpasst. Die tatsächliche Trainingsvorbereitung verwendet Planzahlen, mittlere Zielwiederholungen und letzte Gewichte; die Entlastungswoche reduziert Sätze schematisch. Feedback zu erfassen ist noch keine Rückkopplung in die nächste Planung.

**Für PandaFit:** Die Feedback-Struktur und explizite Trainingsblock-Idee sind verwertbar. Keine Aussage übernehmen, dass ein Pump-/Muskelkater-Algorithmus dort bereits individuell die passende Satzanzahl ermittelt. Wir benötigen für jede gesammelte Rückmeldung einen nachprüfbaren Empfänger und eine klar begrenzte Wirkung.

## 3. Wissenschaftliche Grundlage: Was ist Befund, was bleibt unsere Entscheidung?

Die folgenden Quellen wurden zusätzlich zu den Projektquellen direkt recherchiert. Forschungsergebnisse geben Tendenzen für untersuchte Populationen; sie liefern keine vollständige individuelle Planungsfunktion.

| Thema | Tragfähiger Befund | Daraus folgt für PandaFit | Daraus folgt ausdrücklich nicht |
|---|---|---|---|
| Wochenvolumen | Mehr Volumen zeigt im Mittel abnehmenden Zusatznutzen; direkte und indirekte Beiträge zu unterscheiden verbessert Modelle. | Beitragsmodell und individuelle, verfügbare Kapazität berücksichtigen. | Jede Gruppe benötigt dieselbe starre Pflichtquote. |
| RIR / Versagen | Nähe zum Versagen ist für Muskelaufbau relevant; vollständiges Versagen ist nicht für jeden Satz erforderlich. | Anstrengung erfassen und mit Leistungsverlauf betrachten. | Fehlende RIR = 0 oder RIR 4 = kein Reiz. |
| Wiederholungen | Muskelaufbau ist über einen breiten Last-/Wiederholungsbereich möglich. | Übungsbezogene praktikable Bereiche; keine globale Zwölfergrenze. | Sieben Wiederholungen sind nur Kraft und acht nur Muskelaufbau. |
| Kraft und Ausdauer | Kombinierte Programme zeigen insgesamt keine generelle Einbuße bei Gesamtmuskelwachstum oder Maximalkraft; Explosivkraft und konkrete Anordnung verdienen getrennte Betrachtung. | Tatsächliche Belastung, Terminabstand und Priorität abwägen. | Jeder Lauf oder Beinsatz erfordert pauschal 24–48 Stunden Trainingsverzicht. |
| Pausen | Hinweise auf einen kleinen Vorteil gegenüber sehr kurzen Pausen; keine sekundengenaue individuelle Optimierung. | Vorschläge je Belastung und einfaches Verlängern. | 75 oder 90 Sekunden sind für jede Isolation optimal. |
| Supersätze | Zeitersparnis ist gut begründbar; im Mittel ähnliche langfristige Anpassungen bei teils höherer wahrgenommener Anstrengung. | Passende Kombinationen als Option; Ermüdung und Gerätewechsel beachten. | Supersätze erzeugen automatisch mehr Wachstum oder gleiche Muskeln dürfen nie kombiniert werden. |
| Übungsreihenfolge | Kraftzuwächse fallen eher für früh absolvierte Übungen höher aus; kein universelles ideales Muskelranking. | Prioritäten und technische Anforderungen vorziehen. | Jede Person muss dieselbe Körperteilreihenfolge absolvieren. |
| Muskelzuordnung | Bewegungsfunktion, Ausführung und einzelne Längsschnittstudien erlauben begründete Annäherungen. | Varianten explizit modellieren; Grenzen zeigen. | Ein Koeffizient von 0,75 bedeutet 75 % messbaren individuellen Wachstumsreiz. |
| Aufwärmen | Spezifische Vorbereitung kann Leistung unterstützen; Evidenz für ein universelles Schema ist begrenzt. | Geeignete Vorbereitung pro noch unvorbereitetem Bewegungsblock. | Ein bestimmtes Satzschema garantiert Verletzungsfreiheit. |

Quellen:

- [Pelland et al., publiziert 2026: Volumen, Frequenz und fraktionale Sätze](https://pubmed.ncbi.nlm.nih.gov/41343037/). Das im PandaFit-Grundlagendokument noch als Preprint bezeichnete Projekt ist inzwischen publiziert.
- [Robinson et al., 2024: explorative RIR-Metaregression](https://pubmed.ncbi.nlm.nih.gov/38970765/); [Refalo et al., 2024: achtwöchige Vergleichsstudie, Versagen gegenüber 1–2 RIR](https://pubmed.ncbi.nlm.nih.gov/38393985/).
- [Schoenfeld et al., 2021: Wiederholungs-/Lastkontinuum](https://pubmed.ncbi.nlm.nih.gov/33671664/).
- [Schumann et al., 2022: Concurrent-Training-Metaanalyse](https://pubmed.ncbi.nlm.nih.gov/34757594/). Das betrifft längerfristige Anpassungen; individuelle akute Müdigkeit bleibt möglich. [Eine separate Analyse auf Muskelfaserebene](https://pmc.ncbi.nlm.nih.gov/articles/PMC9474354/) zeigt, dass die Schlussfolgerung auch vom Messendpunkt abhängt.
- [Singer et al., 2024: Satzpausen](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full).
- [Superset-Metaanalyse, 2025](https://pubmed.ncbi.nlm.nih.gov/39903375/). Die bisherige Formulierung in `docs/gym-foundations.md`, es sei keine dedizierte Metaanalyse gefunden worden, ist überholt.
- [Nunes et al., 2021: Übungsreihenfolge](https://pubmed.ncbi.nlm.nih.gov/32077380/).
- [Ribeiro et al., 2021: Aufwärmstrategien](https://revistas.rcaap.pt/motricidade/article/download/21143/17781/95752).

## 4. Vorgeschlagene Architektur: berechenbare Tatsachen, flexible Entscheidungen

Die Empfehlung ist weder ein vollständiger Planungsalgorithmus ohne KI noch eine frei formulierende KI mit anschließendem Größencheck. Vorgeschlagen ist eine kleine gemeinsame Domänenschicht, auf der alle Coaches aufbauen.

### A. Übungsidentität und Messkonventionen

Pro Übung: kanonische ID, Bewegungsfamilie, konkrete Variante, Haupt- und Nebenbeiträge, Ausführungstext und dessen Herkunft. Pro Gerät: Identität, Grundgewicht soweit bekannt, Gewichts-/Widerstandskonvention, erreichbare Stufen und Standort. Ein Wort im Titel entscheidet nie allein über sicherheitsrelevante Einordnung.

Vergleichbare Historie heißt beispielsweise dieselbe Variante, dasselbe relevante Gerät und dieselbe Gewichtskonvention. Zwei Maschinen desselben Typs sind nicht zwingend vergleichbar. Ein unbekanntes Gerät bleibt unbekannt; ein Ersatzkandidat ist kein bestätigter Alias.

### B. Gemeinsame Trainingsbilanz

Jeder tatsächlich absolvierte Satz bleibt ein einzelner Quellsatz. Die Muskelbeiträge sind davon abgeleitete, versionierte Einträge; sie vervielfachen nicht die absolvierte Satzanzahl. Aufwärmen, Arbeit, Drop-Sets, einseitige Ausführung und unbekannte Anstrengung bleiben unterscheidbar.

Die Oberfläche kann erklären: „Drei direkte Trizepssätze, dazu geschätzte Beteiligung beim Drücken.“ Sie sollte nicht bloß eine scheinexakte Gesamtzahl ohne Herkunft ausgeben. Ein unbekannter Anstrengungswert senkt das Vertrauen in eine Anpassung, nicht automatisch den Wert des Trainings.

Anfangs genügen verständliche Gruppen; Gesäß und Beinbeuger sowie vordere, seitliche und hintere Schulter sollten getrennt sein. Ein 40-Muskelmodell samt Tausenden manuell gesetzten Koeffizienten ist für den ersten sinnvollen Schritt nicht erforderlich.

### C. Kapazität und Priorität vor dem Plan

Eingaben: vorhandene Trainingstage, Zeit pro Einheit, geplante Ausdauerbelastung, explizite Wünsche, zuletzt tolerierter Umfang, tatsächlicher Leistungsverlauf und aktuelle Rückmeldung. Daraus ergibt sich ein realistisches Budget.

Bestätigte Produktanforderung zur Planung: Das Produkt unterstützt im Voraus geplante Wochen ebenso wie spontane Trainingsgelegenheiten. Der Planungsstil ist personenspezifisch und darf sich ändern. Eine verfügbare Dauer kann als Grenze vorgegeben werden; alternativ plant der Coach einen zum Ziel und Belastungsstand passenden Umfang und nennt die erwartete Dauer, für die sich die Person Zeit nehmen kann. Eine feste Minutenzahl vor jeder Planung ist keine Voraussetzung. Die Zeitschätzung berücksichtigt Vorbereitung, Satzpausen und Wechsel und bleibt eine Schätzung.

Noch nicht abgestimmter Umsetzungsvorschlag: Wochenplanung, spontane Auswahl und eine Kombination aus festen Terminen und offenen Gelegenheiten greifen auf denselben Trainingszustand zurück. Ausgefallene oder zusätzlich mögliche Termine führen zu einer passenden Anpassung der noch offenen Planung. Der Umfang bleibt auch ohne Zeitobergrenze begründet; unbegrenzt Zeit bedeutet keine Maximierung der Satzzahl.

Die Planung verteilt Arbeit nach Prioritäten und nachhaltiger Abdeckung. Sie versucht nicht, überall große Tabellen-Minima zu erfüllen. Eine ruhige oder ausgefallene Einheit erzeugt keine Trainingsschuld. Wenn Beine aus einem konkreten Grund zurückstehen, bleibt die längerfristige Abdeckung im Blick, statt immer neue Oberkörperarbeit zu ergänzen.

Bestätigte Produktanforderung: Die Gewichtung wird pro Person aus deren Zielen abgeleitet und bleibt veränderbar. Gleichrangiger Muskelaufbau und Ausdauer müssen ebenso unterstützt werden wie ein persönlicher Schwerpunkt. Keine Sportart hat einen fest eingebauten Vorrang. Gleichrangigkeit bedeutet gemeinsame Fortschrittsziele und nachvollziehbare Abwägung; sie verlangt keine identischen Minuten oder Satzzahlen. Eine lange lockere Fahrt ist außerdem kein pauschaler Beweis für dieselbe lokale Ermüdung wie ein schweres Kniebeugentraining.

Noch nicht abgestimmter Umsetzungsvorschlag: langfristige Ziele von einem zeitlich begrenzten Schwerpunkt und einer einmaligen Tagesabweichung unterscheiden. Eine Änderung für heute darf die langfristige Zielgewichtung nicht stillschweigend überschreiben.

### D. Gemeinsame Regeln mit unterschiedlicher Verbindlichkeit

Eine persönliche Regel braucht mindestens: ID, verständlichen Text, Geltungsbereich, Verbindlichkeit, Herkunft, Zustand, Version und optional Ablaufdatum. Die App muss sie erstellen, bearbeiten, pausieren und löschen können. Für eine dauerhafte Regel ist „läuft automatisch nach 60 Tagen aus“ keine geeignete Standardsemantik.

Zwei Arten sind sinnvoll:

1. **Strukturierte Bedingungen:** etwa eine ausdrücklich ausgeschlossene Übung, verfügbare Stange, ein Zeitlimit oder „nur diese nächste Einheit“. Code kann sie zuverlässig prüfen.
2. **Abzuwägende Wünsche:** etwa Gesäß betonen, bestimmte Übungen bevorzugen oder ähnliche Isolationen nur bei erkennbarem Nutzen. Die KI berücksichtigt sie und erklärt wichtige Abweichungen.

Bestätigter Standard: Eine eindeutige dauerhafte Nutzeranweisung wie „Mach das künftig immer so“ darf direkt als sichtbare, bearbeitbare Regel gespeichert werden. Bei mehrdeutigen Aussagen über langfristige Wünsche oder Einschränkungen fragt der Coach gezielt nach. Eine Tagesanweisung wie „Heute keine Kniebeugen“ gilt für heute und schreibt keine dauerhafte Präferenz um. Freitext wird nicht in beliebigen ausführbaren Programmcode übersetzt. Konflikte haben einen benennbaren Grund statt einer heimlichen Regelüberschreibung.

### E. KI-Entwurf und einheitliche Prüfung

Die KI erhält den gemeinsamen Datenstand und entwirft die Einheit. Code prüft referenzierte Übungen, Messkonventionen, ausdrückliche Ausschlüsse, erreichbare Lasten, Satz-/Gruppenkonsistenz und vereinbarte Grenzen. Weiche Trainingspräferenzen werden als Hinweise geprüft; sie machen nicht jeden ansonsten sinnvollen Plan ungültig.

Eine Ablehnung nennt den konkreten Konflikt. Eine begrenzte Korrekturschleife darf daraufhin gezielt nachbessern. Auch ein einfacher Ausweichplan muss dieselben Mindestbedingungen erfüllen. Ein Vorschlag ohne Plan ist bei unvereinbaren Bedingungen ehrlicher als ein ungeprüfter Fallback.

### F. Prüffähige Änderungen mit eindeutigem Geltungsbereich

Vor einer Anwendung stehen Zielobjekt und Ausgangsversion fest. Der Vorschlag zeigt, was sich ändert und ob er für offene Sätze dieser Einheit, das nächste noch nicht gestartete Training oder eine dauerhafte Regel gilt.

Bestätigter Autonomiestandard: Der Coach plant Übungen, Reihenfolge, Wiederholungen, Pausen und Vorbereitung eigenständig anhand vereinbarter Ziele und Regeln. Übliche Weiterentwicklung gemäß einer vereinbarten Progressionsregel erscheint ohne zusätzliche Einzelbestätigung im nächsten Trainingsvorschlag; die Änderung bleibt sichtbar. Größere Änderungen an verbleibenden Übungen oder Lasten während eines laufenden Trainings bietet der Coach dagegen mit Übernehmen und Undo an. Bereits absolvierte Sätze bleiben erhalten. Ziele, langfristige Prioritäten und dauerhafte Einschränkungen werden nicht aus einer einzelnen schlechten Einheit umgeschrieben.

Laufende Einheiten behalten ihre ausgeführten Sätze. Ein später geänderter Wochenplan aktualisiert kommende Entwürfe, aber überschreibt nicht stillschweigend das offene Workout. Beim erneuten Start muss klar sein, welcher bestätigte Plan und welche Änderungen übernommen werden. Speichern und Sync erhalten die vorhandenen PandaFit-Schutzmechanismen für konkurrierende Versionen.

### G. Lernen mit begrenzter Wirkung

Nach der Einheit werden Ist-Umfang, Lasten, Wiederholungen und optionale Rückmeldungen betrachtet. Fortschritt bei vergleichbarer Anstrengung ist ein gutes Signal zum Halten oder vorsichtigen Steigern. Leistungsabfall führt zunächst zur Prüfung von Vergleichbarkeit, Pausen und Datenfrische. Eine einzelne schlechte Tagesform beweist keine langfristige Überlastung.

Anpassungen erfolgen begrenzt, nachvollziehbar und möglichst an wenigen Stellschrauben. Ein automatisch geschätztes MEV/MRV ist keine direkte Messung individueller Grenzen. Die App darf über Wochen nützliche Arbeitsbereiche lernen, sollte dafür aber keine wissenschaftliche Präzision behaupten.

## 5. Konkrete Übernahmeentscheidungen nach ursprünglichem Problem

| Problem | Zu übernehmendes Muster | PandaFit-Anpassung / Grenze |
|---|---|---|
| Rücken-Icons und unerkannte Übungen | Heracles: kanonische IDs; Liftosaur: mehrere Rollen | Metadaten gemeinsam für Planer und UI verwenden; Unknown sichtbar lassen. |
| Falsche/fehlende Beschreibungen | Varianten und Herkunft getrennt speichern | Maschinenanleitung nicht aus Geräte-ignorierender Ähnlichkeit ableiten; priorisierte Abdeckung der tatsächlich verwendeten Übungen. |
| Drag-and-drop | Liftosaur: stabile Identität und ausgewählte Übung erhalten | Zusätzlich Tastatur/Hoch-Runter; Reload-/Sync-Szenario prüfen. |
| Superset mit beliebiger Übung | Liftosaur: Gruppenzugehörigkeit; Ironvellum: freie Partnerauswahl | Explizite Gruppenreihenfolge; Wechselzeit und Rundenpause; ungleiche Satzzahlen. |
| Wissenschaftliche Reihenfolge | Prioritäten vorziehen | Keine feste universelle Körperteilreihenfolge. |
| Unterschiedliche Pausen | Liftosaur: Vorrangfolge und anpassbarer Satz-Timer | Anstrengung und Leistung kontextuell berücksichtigen; keine falsche Stoppuhrpräzision. |
| Volumen und vermeintliche Defizite | Heracles/Liftosaur: direkte und sekundäre Beiträge | Abdeckung und Entwicklung von tatsächlicher anatomischer Schwäche unterscheiden; Zeitbudget zuerst. |
| Gesäß / Deadlifts | Getrennte Muskel- und Bewegungsrollen | Hüftstrecken abdecken, ohne Deadlift zur Pflicht zu machen; Beinbeugen zählt nicht automatisch fürs Gesäß. |
| Stangen-/Scheibenrechner | Liftosaur: begrenztes Inventar und erreichbare Last | Tatsächliches Stangengewicht; unbekannte Smith-Grundlast; Ziel unter Mindestlast erklären. |
| Langer Wochenchat | Bestehende Zeitstempel verwenden, langfristige Regeln separat | Tagestrenner, Zeitangaben, Nachladen und Scrollposition; keine neue Löschpolitik als Ersatz für gute Darstellung. |
| Ähnliche Isolationsübungen | Überschneidung und Wochenkontext erklären | Nicht pauschal verbieten; zweiter Übung einen Zweck und ausreichend Budget geben. |
| Ober-/Unterkörperverteilung | Gemeinsame Absprachen und Kapazitätsbilanz | Beine nicht automatisch wegen jeder Ausdaueraktivität verdrängen. |
| Späte Beinübung ohne Vorbereitung | Ironvellum: Aufwärmen pro Block | Vorbereitung aus realem Gerät/Last ableiten und bereits erfolgte Vorbereitung beachten. |
| Persönliche langfristige Regeln | Liftosaur: Zustand/Scope; Cladiron: Gründe | Einfacher Editor statt Skriptsprache; dauerhafte Regeln unabhängig vom Chatkontext. |

## 6. Kandidatenfolge für spätere sequentielle Arbeitsaufträge

Das ist die aus der Recherche abgeleitete Abhängigkeitsfolge. Es sind noch keine zur Umsetzung freigegebenen Tickets. Tests sollen Verhalten und Datenintegrität sichern, nicht bloß den Quellcode spiegeln. Die Reihenfolge kann nach dem Brainstorming angepasst werden.

| Nr. | Ergebnis eines späteren Auftrags | Wesentlicher Nachweis |
|---:|---|---|
| 1 | Gemeinsame Übungsidentität, Varianten und Unknown-Konvention | Importname und UI führen zur gleichen bekannten Übung; unbekannte Variante bekommt keine fremde Ausführung untergeschoben. |
| 2 | Mehrere versionierte Muskelbeiträge, getrenntes Gesäß/Beinbeuger | Ein Quellsatz bleibt ein Satz; direkte und indirekte Beiträge ohne Gruppen-Doppelzählung; alte Daten unverändert. |
| 3 | Geräte-/Gewichtskonventionen und erreichbare Lasten | Andere Stange, ungerade Bestände, kleine Sprünge, unterstützte Übungen und nicht erreichbare Ziele korrekt. |
| 4 | Übungsbezogene Wiederholungsbereiche und korrigierte Progression | Die vier synthetischen PandaFit-Gegenproben führen zu begründeten Ergebnissen; gleiche Sitzung ist nicht zweimal Erfahrung. |
| 5 | Typisierter gemeinsamer Ziel-, Wochen- und Regelkontext | Persönliche Zielgewichtung einschließlich Gleichrangigkeit, `legs=false` und dauerhafte Regeln überleben vollständigen Speicher-/Sync-/Prompt-Weg; keine fest eingebaute Sportpriorität. |
| 6 | Realistisches Zeit-/Volumenbudget und transparente Planprüfung | Kurze Woche erzeugt erfüllbaren Plan; keine 118-Satz-Pflicht; Fallback durch dieselbe Prüfung. |
| 7 | Gemeinsame Abwägung von lokaler Last, Ausdauer und Datenfrische | Leichte Ruderübung blockiert keine Beine; alte Readiness blockiert nicht unbegrenzt; echte harte Beinarbeit wird beachtet. |
| 8 | Änderungen an laufender Einheit, nächstem Training und Regeln sauber trennen | Bestätigte Änderung bleibt nach Neustart erhalten; andere Version wird erkannt; erledigte Sätze bleiben erhalten. |
| 9 | Frei umordenbare Übungen und beliebige Superset-Partner | Daten bleiben beim Ziehen, Reload und Sync erhalten; Rundennavigation und Pause bei ungleichen Sätzen korrekt. |
| 10 | Vorbereitung pro Bewegungsblock und anpassbare Satzpausen | Späte erste Beinbelastung erhält passendes Angebot; kein doppeltes Aufwärmen; Timer bleibt nach Reload korrekt. |
| 11 | Verständliche Muskelbilanz, Begründungen und Regelverwaltung | Jede wichtige Empfehlung hat tatsächlich passenden Grund; Nutzer kann Regeln ändern/löschen und Schätzungen erkennen. |
| 12 | Chat-Navigation und langfristige Rückmeldung | Tages-/Zeitangaben, ältere Nachrichten und Scrollposition funktionieren; beobachtete Entwicklung verändert künftige Planung nachvollziehbar. |

Kleine, unabhängige Darstellungsfehler können vorgezogen werden. Ein kompletter Wechsel der App-Technik oder ein Neubau der Synchronisation ist nicht erforderlich.

## 7. Lizenz- und Datenübernahme

PandaFits eigener Code ist MIT-lizenziert; Übungstexte und Bilder enthalten bereits separat gekennzeichnete CC-Lizenzen. Von den fünf Projekten ist Repstack ebenfalls MIT; die übrigen stehen unter GPL/AGPL. Eine direkte Übernahme solcher Quelltexte wäre kein neutraler Schritt für eine weiterhin ausschließlich MIT-lizenzierte kombinierte Anwendung. Sie ist technisch möglich, muss aber mit den jeweils anwendbaren Bedingungen geplant werden. [GNU zur Lizenzkombination](https://www.gnu.org/licenses/license-compatibility.en.html)

**Vorschlag:** Zunächst Verhaltensanforderungen, Erkenntnisse und Testfälle übernehmen und passend zu PandaFit selbst umsetzen. Wenn eine konkrete Bibliothek, Datenmatrix, Beschreibung oder Bildsammlung übernommen werden soll, Herkunft, Version, Lizenz und Attribution dafür separat prüfen und dokumentieren. Nicht annehmen, dass eine App-Lizenz automatisch alle enthaltenen Daten und Marken freigibt. [Creative Commons zu Bearbeitungen und Kombinationen](https://creativecommons.org/faq/)

In dieser Untersuchung wurde kein fremder Produktcode und kein fremder Übungsdatensatz in PandaFit integriert.

## 8. Bestätigte Anforderung und offene Produktentscheidungen

**Bestätigt im Brainstorming:** Das Produkt muss Muskelaufbau und Ausdauer gleichrangig unterstützen und ihre Gewichtung flexibel aus den persönlichen Zielen ableiten. Ein allgemeiner Ausdauervorrang ist nicht gewünscht. Die konkrete Zielstruktur, vorübergehende Schwerpunkte und Tagesabweichungen sind noch zu gestalten.

**Ebenfalls bestätigt:** Planungsstil und Zeitvorgaben unterscheiden sich je Person. Vorausgeplante Wochen und spontane Einheiten müssen unterstützt werden. Zeit darf sowohl eine vorgegebene Grenze als auch die geschätzte Folge des sinnvoll geplanten Umfangs sein.

**Bestätigter Autonomiestandard:** Eigenständige Planung und Anwendung vereinbarter Progressionsregeln; sichtbare Änderungen im nächsten Trainingsvorschlag; größere Änderungen im laufenden Training als Angebot mit Übernehmen und Undo; ausgeführte Sätze unverändert. Eindeutig angewiesene dauerhafte Wünsche darf der Coach direkt sichtbar als bearbeitbare Regel speichern. Bei mehrdeutigen langfristigen Aussagen fragt er nach. Einzelne Tagesentscheidungen oder schlechte Leistungen überschreiben nicht stillschweigend Ziele und dauerhafte Regeln.

Noch als Entwurf auszugestalten sind die konkrete Zielstruktur, eine mögliche Kombination aus festen Terminen und offenen Gelegenheiten, Regelprioritäten bei Konflikten und die genaue Abgrenzung größerer Änderungen im laufenden Training. Die vorgeschlagene technische Architektur und die Kandidatenfolge der Arbeitsaufträge sind weiterhin Umsetzungsvorschläge, keine bereits vollständig freigegebene Implementierungsspezifikation.

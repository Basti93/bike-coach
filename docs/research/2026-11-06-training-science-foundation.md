# PandaFit: wissenschaftliche Trainingsgrundlage und ihre Übersetzung in Planung

Stand: **06.11.2026**. Ergänzung zum [Grundkonzept](../superpowers/specs/2026-11-06-adaptive-training-coach-design.md). Status: recherchierte fachliche Grundlage mit **vorgeschlagenen Produktentscheidungen**, keine bereits implementierte oder individuell validierte Trainingssteuerung.

## 1. Zweck, Recherche und Geltungsbereich

Kraftentwicklung, Hypertrophie und Ausdauer erhalten eigenständige fachliche Grundlagen. HIIT wird als Ausdauermethode mit eigener Dosierung und Auswertung behandelt. Die Kombination wird ausdrücklich mitgeplant. Ein allgemeines Wort wie „Fitness“ darf diese Unterschiede nicht verdecken.

Die Recherche erfolgte am 06.11.2026 über PubMed, Verlagsseiten, WHO und institutionelle Autoren-Repositorien. Gesucht wurden aktuelle Evidenzsynthesen, ergänzend grundlegende Methodenarbeiten und ausgewählte Originalstudien. Das ist eine gezielte Literaturprüfung, **keine vollständige systematische Übersichtsarbeit** mit registriertem Protokoll, doppelter Studienauswahl oder eigener Metaanalyse. Lesetiefe und Grenzen stehen im Quellenregister. Die Existenz einer Metaanalyse oder eines Positionsstands macht nicht jede darin diskutierte Zahl zu einer universellen Vorgabe.

Die erste Planung richtet sich an erwachsene Freizeitsporttreibende. Trainingserfahrung, bekannte Einschränkungen und Ziele müssen berücksichtigt werden. Ergebnisse aus jungen Männern, Ausdauerathleten oder klinischen Gruppen werden nicht als gleichermaßen bewiesen für jede Person dargestellt. Rehabilitation, klinische HIIT-Protokolle, Leistungssport-Peaking und Programme für Minderjährige werden daraus nicht automatisch angeboten. Die vorhandene Beschwerdebehandlung bleibt zuständig; die Erweiterung führt keine Diagnostik ein.

Vorhandene Grundlagen bleiben als Beschreibung des Bestands lesbar: [Gym](../gym-foundations.md), [Laufen](../run-foundations.md), [Pulszonen](../hr-zones.md) und [FTP-Schätzung](../ftp-estimate.md). Dieses Dokument unterscheidet neue fachliche Empfehlungen von aktuell wirksamen Regeln. Bestehender Code wird durch seine Veröffentlichung nicht geändert.

## 2. Ziele, Methoden und Messgrößen

**Entwurfsentscheidung:** Ein Ziel bezeichnet gewünschte Entwicklung. Eine Methode bezeichnet einen möglichen Weg. Eine Messgröße bezeichnet die beobachtbare Annäherung daran.

| Ziel | Geeignete Beobachtung | Grenze der Aussage |
|---|---|---|
| Kraftentwicklung | Leistung bei gleicher Übung, Ausführung, Gerätekonvention und vergleichbaren Bedingungen; optional spezifischer Krafttest | Mehr Wiederholungen oder ein e1RM sind keine direkte Messung sämtlicher Kraftfähigkeiten. |
| Hypertrophie | Tatsächlicher Trainingsumfang und Leistungsentwicklung als Planungsinformationen; optional freiwillige, standardisierte Körpermaße | Satzanzahl, Tonnage und gestiegene Kraft messen kein individuell entstandenes Muskelgewebe. |
| Ausdauer | Längere verträgliche Belastung, Leistung/Pace bei vergleichbarer Anstrengung, passend gewählter Test | FTP, Laufzeit, Geräte-VO₂max und Labormessung sind verschiedene Messgrößen. |
| Befristeter Schwerpunkt | Eine zum Schwerpunkt passende Auswahl dieser Beobachtungen | Ein Schwerpunkt ändert nicht still die langfristigen Ziele. |

HIIT, kontinuierliches Ausdauertraining, schwere Sätze und Supersätze werden als Methoden gespeichert. „Mehr HIIT“ wird nur bei eindeutiger Aussage zu einer dauerhaften Vorliebe; es ist kein universelles Ziel für alle Profile. Maximalkraft und Explosivkraft bleiben begrifflich getrennt. Spezielle Explosivkraftprogramme sind zunächst kein zusätzlicher Implementierungsumfang.

## 3. Wie aus Literatur eine verwendbare Regel wird

Jede fachlich begründete Planungsregel erhält einen kurzen, versionierten Evidenzeintrag. Der Implementierungsplan entscheidet das Dateiformat; folgende Inhalte sind verbindlich:

- Regel-ID, fachliche Aussage und betroffene Entscheidung, etwa Lastauswahl oder Intervalltyp.
- Quelle mit DOI/PMID/URL, Erscheinungsdatum, Prüfdatum und Lesetiefe.
- Untersuchte Population, Methode, Vergleich, Endpunkt und relevante Dosisbeschreibung.
- Richtung des Befunds sowie Unsicherheit und Übertragungsgrenzen. Falls eine Effektgröße verwendet wird, gehören Skala, Vergleich und Unsicherheitsintervall dazu.
- Gegenbefunde oder abweichende Synthesen; ein älterer und ein neuerer Review können dieselben Primärstudien enthalten und zählen nicht als unabhängige Bestätigungen.
- Getrennt davon: gewählte App-Vorgabe, Begründung, Ausnahmen, technische Durchsetzung und Abnahmeszenario.
- Version und Ablösung: neue Literatur ändert nicht ohne geprüfte Policy-Aktualisierung einen laufenden Plan.

**Entwurfsentscheidung:** Die App unterscheidet fachliche Orientierung, Produktheuristik, persönliche Vorgabe und technische Bedingung. Eigene Einschätzungen wie „gut gestützte Richtung“ sind keine nachträglich erfundene GRADE-Bewertung. Fehlende statistisch signifikante Unterschiede belegen weder perfekte Gleichwertigkeit noch Wirkungslosigkeit.

Ein Literaturhinweis soll eine konkrete Aussage tragen. Beispiel: „Größere Lasten begünstigen spezifische Kraftzuwächse“ ist eine andere Aussage als „du brauchst heute exakt 82,5 % 1RM“. Die zweite Zahl braucht zusätzlich eine begründete Planungsentscheidung und geeignete persönliche Daten.

## 4. Kraftentwicklung

### Fachlicher Kern

Der ACSM-Positionsstand 2026 fasst 137 systematische Reviews zusammen. Er beschreibt Vorteile schwererer Lasten für Kraft, einer frühen Platzierung der Zielübung und mehrerer wöchentlicher Kontakte. Ein großer Teil der zugrunde liegenden Forschung betrifft wenig trainierte Erwachsene. Seine Angaben sind Ausgangspunkte für die Zielrichtung, kein individueller Algorithmus. [ACSM 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/)

Die Netzwerkmetaanalyse von Currier et al. findet Verbesserungen durch unterschiedliche Trainingsvorgaben; höhere Lasten kennzeichnen die für Kraft am höchsten eingeordneten Programme. Rangplätze alleine begründen kein für alle überlegenes Programm. [Currier 2023](https://pubmed.ncbi.nlm.nih.gov/37414459/)

| Regel | Übersetzung für PandaFit | Grenze / ungeeignete Ableitung |
|---|---|---|
| K1: spezifische Kraft priorisieren | Wenige passende Zielübungen über mehrere Gelegenheiten vergleichbar halten; bei Bedarf früh absolvieren. | Kein zufälliger wöchentlicher Austausch sämtlicher Übungen. Maschinenlasten verschiedener Geräte sind keine gemeinsame Skala. |
| K2: höhere Lasten gezielt einsetzen | Bei passender Erfahrung können schwerere Arbeitsbereiche einen größeren Anteil erhalten. | Keine verpflichtenden ≥80 % 1RM für Einsteiger und kein erfundener 1RM-Wert. |
| K3: Kontakte sinnvoll verteilen | Zielübungen wiederholt üben, soweit Gelegenheiten und Verträglichkeit passen. | Eine fehlende zweite Einheit macht die vorhandene Einheit nicht wertlos. |
| K4: Leistung erhalten | Satzpausen und Gruppierung an der Qualität der Zielübung ausrichten. | Ein Zeitlimit rechtfertigt keine beliebig verkürzte Pause bei unverändertem schweren Umfang. |

Kraftzuwächse fallen in einer Reihenfolge-Metaanalyse eher bei früh absolvierten Übungen höher aus. Für Hypertrophie ergibt sich daraus kein allgemeines Körperteilranking. [Nunes 2021](https://onlinelibrary.wiley.com/doi/abs/10.1080/17461391.2020.1733672)

Eine Periodisierungsmetaanalyse findet bei gleichem Volumen einen kleinen Vorteil für 1RM-Kraft, aber keinen klaren Hypertrophievorteil. Der neuere ACSM-Überblick beurteilt den konsistenten Zusatznutzen zurückhaltender. Deshalb ist geplante Variation für fortgeschrittene Kraftziele möglich; eine komplexe Blockfolge oder jede vierte Woche Entlastung wird nicht als wissenschaftliche Pflicht eingeführt. [Moesgaard 2022](https://pubmed.ncbi.nlm.nih.gov/35044672/)

### Vorgeschlagene Startpolicy, keine biologische Grenze

Für bereits erfahrene Personen mit Kraftschwerpunkt sind etwa **3–6 Wiederholungen** bei passenden Hauptübungen ein möglicher Startbereich, ergänzende Übungen können höher liegen. Der Einstieg kann bewusst leichter und mit mehr Wiederholungen erfolgen. Plan und Begründung nennen den gewählten Bereich pro Übung.

Ein spezifischer 1RM-Test wird nicht verlangt. Vergleichbare submaximale Leistungen genügen für erste Vorschläge. Fortschritt bedeutet nicht, in jeder Einheit Last steigern zu müssen. Erhalt eines guten Niveaus kann bei gemischten Zielen eine absichtliche Planentscheidung sein.

## 5. Hypertrophie

### Umfang, Frequenz und Beteiligung

Die Metaregression von Pelland et al. umfasst 67 Studien mit 2058 überwiegend jungen und männlichen Teilnehmenden. Direkte und indirekte Sätze zu unterscheiden verbessert die Modellierung; die fraktionale Zählung mit 0,5 für indirekte Sätze passt relativ am besten. Die Kurven zeigen abnehmenden Zusatznutzen. Das misst weder individuelle Muskelanteile noch ein persönliches maximales Erholungsvolumen. [Pelland 2026](https://pubmed.ncbi.nlm.nih.gov/41343037/)

**Entwurfsentscheidung H1:** Direkte und indirekte Arbeit werden getrennt gezeigt; 1/0,5 ist eine transparente Startkonvention. Wöchentlicher Umfang ist ein begrenztes gemeinsames Budget. Zielmuskeln erhalten bei Bedarf mehr Anteil, andere können mit weniger Arbeit erhalten oder entwickelt werden. Es werden keine großen Mindestquoten für alle Muskeln gleichzeitig erzwungen. Die ACSM-Orientierung von ≥10 Wochensätzen zur Steigerung von Hypertrophie ist keine Behauptung, dass darunter kein Wachstum möglich wäre oder jede Anfängergruppe sofort zehn direkte Sätze benötigt.

**Entwurfsentscheidung H2:** Frequenz dient auch dazu, sinnvollen Umfang auf verfügbare Gelegenheiten zu verteilen. Sie wird nicht unabhängig davon maximiert. Ein zweiter Curl ist zulässig, wenn Muskelabdeckung, zusätzliche Funktion und Gesamtumfang ihn rechtfertigen; die Armbeiträge aus Zugübungen werden vorher berücksichtigt.

### Last und Anstrengung

Eine Last-Netzwerkmetaanalyse findet Hypertrophie über unterschiedliche Lastbereiche; die eingeschlossenen Programme trainierten bis zum willentlichen Versagen. Der Befund darf nicht auf beliebig leichte, wenig anstrengende Sätze verallgemeinert werden. Schwere Lasten begünstigen die spezifische Kraft stärker. [Lopez 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8126497/)

Die explorative RIR-Metaregression spricht für mehr Hypertrophie näher am Versagen, bei unklarer genauer Dosisbeziehung. RIR wurde für viele Studien aus Beschreibungen geschätzt; für Kraft ist das Muster anders. Das trägt keinen scharfen Cut zwischen RIR 3 und 4. [Robinson 2024](https://rke.abertay.ac.uk/en/publications/exploring-the-dose-response-relationship-between-estimated-resist/)

**Entwurfsentscheidung H3:** Als praktikable anfängliche Bereiche dienen beispielsweise 6–15 Wiederholungen bei vielen Mehrgelenksübungen und 10–20 bei geeigneten Isolationen. Andere passende Bereiche bleiben möglich. Für viele Arbeitssätze ist eine geplante Reserve von ungefähr 1–3 Wiederholungen ein Ausgangspunkt; Einstieg, schwere technische Übungen und besondere Umstände können mehr Reserve rechtfertigen. Das ist keine exakte universelle Optimumsbehauptung. Versagen ist eine Option unter passenden Bedingungen, keine Pflicht und kein automatischer Misserfolg.

Fehlende RIR werden nicht ergänzt. Solche Sätze bleiben in der beobachteten Arbeitsbilanz; die Anstrengungsbewertung wird als unvollständig gezeigt. Hohe Wiederholungen fallen nicht allein wegen ihrer Anzahl aus der Bilanz. Eine pauschale Lastsenkung nach mehreren Meldungen „keine Reserve“ widerspricht der vorgesehenen Betrachtung tatsächlicher Entwicklung.

### Pausen, Vorbereitung und Supersätze

Für Hypertrophie weist die Pausen-Metaanalyse auf einen möglichen kleinen Vorteil gegenüber sehr kurzen Pausen hin, mit erheblicher Unsicherheit. Sie identifiziert keine sekundengenaue individuelle Bestpause. Die ältere Kraftübersicht spricht bei Trainierten eher für längere Pausen; im ACSM-Überblick ist der Kraftunterschied weniger eindeutig. [Singer 2024](https://pubmed.ncbi.nlm.nih.gov/39205815/), [Grgic 2018](https://pubmed.ncbi.nlm.nih.gov/28933024/)

**Entwurfsentscheidung H4:** Mögliche Startbereiche sind 2–3 Minuten bei anstrengenden Mehrgelenksübungen, 1–2 Minuten bei geeigneten Isolationen und 3–5 Minuten bei schweren priorisierten Kraftsätzen. Ziel, Übung, Satzleistung und Rückmeldung bestimmen Anpassungen; die Bereiche sind veränderbare Timer-Vorgaben. Eine zusätzliche Erholung kann sinnvoller sein als eine Lastsenkung. Dauerabschätzung und Timer verwenden dieselben Werte.

Die Aufwärmübersicht umfasst elf Studien und liefert kein einheitlich überlegenes Schema. Untersucht wurde vorrangig Leistung, kein Nachweis der Verletzungsfreiheit durch eine bestimmte Rampe. [Ribeiro 2021](https://revistas.rcaap.pt/motricidade/article/view/21143)

**Entwurfsentscheidung H5:** Vorbereitung wird vor der ersten relevanten Belastung eines Bewegungsblocks berücksichtigt, auch spät im Training. Der Coach prüft bereits erfolgte Vorbereitung, tatsächliche Last und Erfahrung. Eine Maschine ist weder automatisch gelenkschädlich noch von Vorbereitung ausgenommen. Aufwärmsätze sind keine gleichwertigen Hypertrophiesätze und lösen keine pauschale Erholungssperre aus.

Die Supersatz-Metaanalyse findet Zeitersparnis und im Mittel ähnliche langfristige Anpassungen, bei höherer wahrgenommener Anstrengung. Ähnliche Bewegungsmuster können die bewältigte Volumenlast verringern. Die Anzahl langfristiger Untersuchungen ist begrenzt. [Zhang 2025](https://pubmed.ncbi.nlm.nih.gov/39903375/)

**Entwurfsentscheidung H6:** Beliebige Partner sind bedienbar. Der Coach bevorzugt bei Zeitdruck geeignete Paarungen, überprüft Leistung und trennt Wechselzeit von Rundenpause. Zwei Bizepsübungen direkt zu koppeln wird anders geplant als Zug- und Druckübung. Ein kurzer Kraftzirkel wird nicht allein wegen hoher Herzfrequenz als nachgewiesener Ersatz eines Ausdauer-HIIT-Protokolls bewertet.

### Progression

In einer achtwöchigen randomisierten Studie mit trainierten Erwachsenen waren sowohl Wiederholungs- als auch Lastprogression brauchbare Wege. Das beweist nicht das konkrete PandaFit-Verfahren. [Plotkin 2022](https://pubmed.ncbi.nlm.nih.gov/36199287/)

**Entwurfsentscheidung H7:** Doppelte Progression bleibt ein einfaches gewähltes Verfahren. Der Lastschritt muss erreichbar sein; neue Lasten werden nicht aus einem generischen Kilogrammsprung erfunden. Bei Stagnation werden zuerst Vergleichbarkeit, absolvierte Sätze, Vorbereitung, Pause, Datenlücken und aktuelle Rückmeldung betrachtet. „Mehr Sätze“ ist keine automatische erste Antwort.

## 6. Ausdauer: Ziel, Intensität und Verteilung

### Gesundheit und Leistungsziel unterscheiden

Die WHO empfiehlt Erwachsenen für gesundheitlichen Nutzen 150–300 Minuten moderate oder 75–150 Minuten intensive aerobe Aktivität pro Woche oder eine entsprechende Kombination, ergänzt durch Muskelkräftigung. Auch geringere Aktivität ist sinnvoll; ein Einstieg darf kleiner sein. Das ist keine Formel für optimale FTP, Laufleistung oder den Umfang jeder einzelnen Person. [WHO 2020](https://www.who.int/europe/news-room/fact-sheets/item/physical-activity)

**Entwurfsentscheidung A1:** „Allgemeine Fitness“, „länger locker fahren/laufen“ und eine konkret bessere sportliche Leistung können verschiedene Pläne erzeugen. Eine Gesundheitsorientierung wird als solche angezeigt. Die WHO-Umrechnung moderat/intensiv wird nicht als Gleichsetzung von Ermüdung, Laufkilometern oder Kraftsätzen übernommen.

### Intensität aus verfügbaren Daten ableiten

Ein kritischer Review beschreibt die Grenzen fester Prozente von Maximalwerten und begründet eine zugängliche individuelle Steuerung einschließlich wahrgenommener Anstrengung. Das ist ein vorgeschlagenes Rahmenmodell, keine für jede Person validierte Schwellenmessung per Fragebogen. [Lehtonen 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9185660/)

Die CP/W′-Übersicht unterscheidet FTP als praktischen Leistungsanker von physiologischen Schwellen. Gleiche FTP-Prozente bedeuten nicht automatisch gleiche Beanspruchung; auch CP/W′-Schätzungen hängen von Protokoll und Modell ab. Ein CP-Modell ist keine notwendige Voraussetzung für erste Ausdauerplanung. [Chorley und Lamb 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7552657/)

**Entwurfsentscheidung A2:** Jede Intensitätsvorgabe nennt Anker und Herkunft: beispielsweise Radleistung aus einer datierten FTP-Schätzung, gemessene sportartspezifische Schwelle, Laufpace aus passendem Test oder subjektiv beschriebene Anstrengung. Messung, Schätzung und bloßer Startwert sind unterscheidbar. Altersschätzungen der maximalen Herzfrequenz sind keine gemessenen individuellen Schwellen. Die höchste einzelne Sensormessung wird nicht ungeprüft zum verlässlichen Maximalpuls.

Puls, Leistung/Pace und Rückmeldung werden gemeinsam interpretiert. Ohne Sensoren bleibt eine Planung nach Dauer und verständlicher Anstrengung möglich. Die App nennt das jeweilige Zonenmodell; „Zone 2“ eines Drei-Zonen-Modells wird nicht mit „Zone 2“ der vorhandenen Fünf-Zonen-Anzeige gleichgesetzt. Wenn sich Zonen ändern, bleiben Rohdaten und frühere Berechnungsgrundlage nachvollziehbar.

### Kein vorgeschriebenes 80/20 für alle

Die Metaanalyse von Oliveira et al. 2024 findet einen kleinen VO₂peak-Vorteil polarisierten Trainings, insbesondere in kürzeren Untersuchungen und bei hoch Trainierten; für andere Leistungsendpunkte keinen entsprechenden allgemeinen Vorteil. Die Individualdatenanalyse von Rosenblat et al. 2025 umfasst 13 Studien mit 348 überwiegend männlichen Ausdauerathleten und findet insgesamt keinen klaren Unterschied zwischen polarisiert und pyramidal. Subgruppen sind Hinweise. Die Netzwerkmetaanalyse von Li et al. 2026 liefert ebenfalls keine eindeutige allgemeine Überlegenheit; Rangwahrscheinlichkeiten ersetzen keinen gesicherten Unterschied. [Oliveira 2024](https://link.springer.com/article/10.1007/s40279-024-02034-z), [Rosenblat 2025](https://dspace.stir.ac.uk/handle/1893/38072), [Li 2026](https://pubmed.ncbi.nlm.nih.gov/42171506/)

**Entwurfsentscheidung A3:** Umfang und Mischung richten sich nach Ziel, Erfahrung, verfügbarer Zeit und tatsächlicher Verträglichkeit. Lockere kontinuierliche Arbeit, angemessen dosierte mittlere Intensität und Intervalle können eingesetzt werden. Es gibt keine Pflichtquote von 20 % hartem Training und keine pauschale Bezeichnung mittlerer Intensität als nutzlos. Ein Profil mit wenigen Einheiten bekommt nicht automatisch dieselbe Verteilung wie ein Hochvolumenathlet.

Verteilungen benennen ihren Nenner: Zeit in Zonen, Anzahl Einheiten und Zielintensität der Hauptteile sind verschiedene Auswertungen. Ein- und Ausfahren, Erholung zwischen Intervallen und Pulsverzögerung werden nicht verschwiegen, um eine Quote zu erfüllen.

## 7. HIIT als eigene Methodenfamilie

### Was die Evidenz trägt

Der HIIT-Umbrella-Review von Poon et al. findet Vorteile für kardiorespiratorische Fitness gegenüber Nichttraining und häufig gegenüber kontinuierlichem Training. Die Qualität der eingeschlossenen Übersichten reicht überwiegend von moderat bis kritisch niedrig; die Protokolle und Populationen unterscheiden sich stark. [Poon 2024](https://onlinelibrary.wiley.com/doi/10.1111/sms.14652)

Die Metaanalyse von Bi et al. 2026 über 115 Studien findet im Mittel einen Vorteil bei der VO₂max-Entwicklung gegenüber moderatem bis intensivem kontinuierlichem Training. Für Schwellen, Ökonomie und Leistungsendpunkte ergeben sich keine ebenso klaren Unterschiede. Bessere VO₂max-Ergebnisse bedeuten deshalb nicht automatisch bessere Ergebnisse für jedes Ausdauerziel. [Bi 2026](https://pubmed.ncbi.nlm.nih.gov/41804294/)

Die Übersicht von Schoenmakers et al. 2026 untersucht 239 Protokolle aus 86 Arbeiten: längere Belastungen ab zwei Minuten erzeugen akut mehr Zeit nahe VO₂max als die verglichenen kürzeren Belastungen. Die Verbindung dieses Messwerts zu langfristigen Anpassungen bleibt offen. Das belegt weder einen universellen Sieger noch eine individuelle optimale Intervalllänge. [Schoenmakers 2026](https://pubmed.ncbi.nlm.nih.gov/42237396/)

### Dosierung und Protokollbeschreibung

Die Programmierungsübersicht von Buchheit und Laursen beschreibt Intensität und Dauer von Belastung und Erholung, Sportart, Wiederholungen, Serien und Serienpausen als zusammenwirkende Stellgrößen. Neben kardiorespiratorischen Antworten gehören neuromuskuläre und mechanische Belastung zur Beurteilung. Die Arbeit ist eine fachliche Übersicht, kein einzelnes Vergleichsexperiment. [Buchheit und Laursen 2013](https://martin-buchheit.net/wp-content/uploads/2018/01/buchheit-laursen-hit-solutions-to-the-programming-puzzle-part-i.pdf)

**Entwurfsentscheidung I1:** Ein Intervallplan enthält Ziel, Sportart, Protokollfamilie, Vorbereitung, Belastungsdauer/-intensität, Erholungsdauer/-intensität, Wiederholungen, gegebenenfalls Serien, Gesamtdauer und Progressionsidee. Kurze und längere aerobe Intervalle werden von maximalen Sprintprotokollen unterschieden. „HIIT“ alleine ist keine vollständige Verordnung. Maximalsprints werden nicht zum automatischen Einstieg.

**Entwurfsentscheidung I2:** Zunächst werden kontrollierbare Protokolle für den vorhandenen Radtrainer fachlich erschlossen. Laufen hat eine eigene Dosierung und mechanische Belastung. Das bereits vereinbarte Profilziel „erst wieder fit, dann Distanz“ bleibt gültig; die Recherche aktiviert dort keine Tempoeinheiten. Die allgemeine Zielarchitektur erlaubt später bewusst gewählte Laufintervalle, deren Produkterweiterung eigens geplant wird. Keine zusätzliche Sportaufzeichnung ist Bestandteil dieses Grundlagenpakets.

Als bekanntes Protokollbeispiel untersuchte Helgerud et al. 4 × 4 Minuten mit dreiminütiger aktiver Erholung sowie kurze Intervalle bei 40 moderat trainierten Männern über acht Wochen. Die Untersuchung zeigt eine wirksame Möglichkeit, keine universelle Einstiegseinheit für jedes Profil oder jede Sportart. [Helgerud 2007](https://pubmed.ncbi.nlm.nih.gov/17414804/)

**Entwurfsentscheidung I3:** Für den ersten individuell passenden Vorschlag werden vorhandene Ausdauererfahrung, jüngste intensive Arbeit, Kalibrierung und persönliche Wünsche verwendet. Fehlende persönliche Intervalldaten rechtfertigen weder erfundene maximale Wattwerte noch ein generelles Intervallverbot. Eine kontrollierte, nach Anstrengung beschriebene Alternative oder eine gezielte Rückfrage sind möglich. Bekannte aktuelle Einschränkungen bleiben wirksam.

Eine vorgeschlagene allgemeine Einstiegspolitik ist höchstens **eine zusätzliche intensive Ausdauereinheit pro Woche**, wenn intensive Arbeit neu eingeführt wird und der gemeinsame Kontext dafür Raum lässt. Null kann passend sein; eine erfahrene Person mit verträglicher Historie darf eine andere Dosis erhalten. Diese Zahl ist eine vorsichtige **Produktentscheidung**, kein aus einer Metaanalyse bewiesenes Wochenoptimum und keine zusätzliche Einheit gegen einen vereinbarten Wochenumfang.

**Entwurfsentscheidung I4:** Die Zielintensität bezieht sich auf die jeweilige Dauer und eine plausible persönliche Leistungsfähigkeit. Puls ist bei kurzen Belastungen keine sekundengenaue Stellgröße. Die vorhandene 130-%-FTP-Grenze beweist weder, dass jedes darunterliegende Intervall passend ist, noch dass jedes höhere Protokoll grundsätzlich ungeeignet wäre. Neue Protokollfamilien werden erst nach abgestimmter Prüfung der Geräteausführung und ihrer Grenzen freigeschaltet.

**Entwurfsentscheidung I5:** Fortschritt wird aus vergleichbar ausgeführten Wiederholungen, erhaltener Leistung und wahrgenommener Verträglichkeit beurteilt. Zunächst wird möglichst eine Stellgröße geändert: etwa mehr Wiederholungen, längere Belastungszeit oder passende Intensität. Sinkt die Ausführungsqualität deutlich, werden Umfang oder Intensität angepasst; eine kurzfristig nicht erreichte Pulszahl löst kein automatisches Hochregeln aus. Gesamtzeit enthält Vorbereitung, alle Erholungen und Ausklang.

## 8. Kraft, Hypertrophie und Ausdauer gemeinsam planen

Die Concurrent-Training-Metaanalyse von Schumann et al. mit 43 Studien findet insgesamt keine klare Beeinträchtigung von Maximalkraft und Gesamtmuskelwachstum gegenüber gleichem Krafttraining allein, wohl aber Nachteile bei Explosivkraft, besonders innerhalb derselben Einheit. Das erlaubt keine Aussage, jede zusätzliche Dosis sei beliebig verträglich. Akute Ermüdung und individuelle Organisation bleiben relevant. [Schumann 2022](https://pubmed.ncbi.nlm.nih.gov/34757594/)

**Entwurfsentscheidung C1:** Der gemeinsame Kontext führt mehrere Belastungsdimensionen: lokale Muskelarbeit, kardiometabolische Anstrengung, Dauer und bei Bedarf mechanische Laufbelastung. Er berücksichtigt geplante und ausgeführte Einheiten getrennt. Es wird keine angeblich physiologische gemeinsame Währung aus Kraftminuten, Rad-TSS und Laufkilometern gebildet.

**Entwurfsentscheidung C2:** Priorisierte Leistung bekommt bei Konflikten möglichst die frischere Gelegenheit. Bei gleichrangigen Zielen wird die Verteilung über mehrere Einheiten betrachtet. Inhaltlich mögliche Kombinationen dürfen nicht allein wegen eines allgemeinen „Beine in den letzten 48 Stunden“-Flags verschwinden. Ein ausdrücklicher Wunsch nach lockerer Ausdauer im Anschluss wird im Gesamtplan berücksichtigt.

**Entwurfsentscheidung C3:** Belastende Unterkörperarbeit und harte Ausdauer werden nach Möglichkeit sinnvoll auseinandergelegt oder dosiert. Eine zusätzliche zeitliche Trennung ist eine Option mit Zielbegründung, kein Versprechen vollständiger Interferenzfreiheit nach exakt drei Stunden. Die technische Sperre, eine ausdrückliche persönliche Einschränkung und eine fachliche Empfehlung werden verschieden dargestellt.

**Entwurfsentscheidung C4:** Kann der verfügbare Rahmen nicht alle gewünschten Umfänge tragen, zeigt der Coach den Konflikt und eine priorisierte Lösung. Er addiert nicht unabhängig vollständige Kraft-, Hypertrophie- und Ausdauerprogramme. Die Aufteilung ist eine nachvollziehbare Entscheidung, kein nachgewiesener individueller Optimierer.

## 9. Progression, Erholung und Lernen über Wochen

Eine systematische Übersicht zu Trainingsantworten zeigt, wie Messfehler und gewählte Schwellen die Einstufung als „Responder“ verändern. Ein kurzfristiger Unterschied rechtfertigt keine feste persönliche Kategorie. [Übersicht zu Trainierbarkeit und Antwortklassifikation 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8606564/)

Bei Laufprogression ist die bekannte wöchentliche 10-%-Regel nicht als allgemeine Verletzungsvermeidung belegt. Eine neuere Beobachtungsstudie mit 5205 Läufern verbindet dagegen Sprünge der **einzelnen Distanz gegenüber dem längsten Lauf der letzten 30 Tage** mit mehr Überlastungsbeschwerden. Das ist ein anderer Nenner und kein randomisierter Nachweis einer sicheren Grenze. [Systematischer Review 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9528699/), [Frandsen 2025](https://pubmed.ncbi.nlm.nih.gov/40623829/)

**Entwurfsentscheidung L1:** Dosisänderungen beruhen auf mehreren vergleichbaren Gelegenheiten und berücksichtigen ausgefallene oder unvollständige Daten. Ein jüngster Umfang ist weder Mindestpflicht noch Freibrief zur Steigerung. Die App darf eine ausdrücklich gewählte vorsichtige Steigerungsgrenze verwenden, bezeichnet sie aber als solche.

**Entwurfsentscheidung L2:** Entlastung kann bei wiederholtem Leistungsabfall, geänderter Verfügbarkeit oder berichteter Müdigkeit sinnvoll vorgeschlagen werden. Es gibt keine automatische Diagnose „Übertraining“, keine ausbleibende Pflichtentlastung als Fehler und keine unbefristete Sperre durch alte Readiness-Daten. Pausen oder Prüfintervalle sind keine Schulden.

**Entwurfsentscheidung L3:** Leistung, absolvierte Dosis, Belastungsempfinden und Beschwerden werden getrennt gespeichert. Konkrete Frischefenster, Mindestanzahl von Vergleichen und maximale Änderungsschritte werden als versionierte Produktpolicy festgelegt. Persönliche Langzeitziele und Dauerregeln ändern sich daraus nicht selbstständig.

**Entwurfsentscheidung L4:** Ergebnisse werden zielgerecht beurteilt. Mehr Tonnage ist kein Beweis für mehr Wachstum; eine höhere FTP-Schätzung ist keine direkte VO₂max-Messung. Bei Ausdauertrends werden vergleichbare Strecke/Steigung, Temperatur soweit bekannt, Sensorqualität und Unterbrechungen berücksichtigt. Ein niedrigerer Puls an einem einzelnen Tag ist kein sicherer Fitnesszuwachs.

## 10. Bestehende Vorgaben: expliziter Übergang statt stiller Widerspruch

Diese Tabelle beschreibt den Handlungsbedarf im Implementierungsplan. **Bis eine geprüfte Migration umgesetzt ist, bleiben die aktuellen ausführbaren Grenzen bestehen.** Eine neue Quellenliste allein hebt keine Grenze auf. Technische Gerätegrenzen und die bestehende Beschwerdebehandlung werden nicht pauschal gelockert.

| Bestand | Einordnung und gewünschter Übergang |
|---|---|
| Gym: global 6–12, pauschaler mindestens 2,5-kg-Sprung | Durch übungsbezogene Bereiche und tatsächlich erreichbare Lastschritte ersetzen. |
| Gym: RIR-0-Meldungen führen pauschal zu −10 % | Durch Beurteilung von Leistung und Kontext ersetzen; historische Rückmeldungen nicht umdeuten. |
| Muskelziele: gleichzeitig unerfüllbare Mindestquoten | Gemeinsam verfügbaren Umfang verteilen; indirekte Arbeit kenntlich machen. |
| Rad: 48 Stunden nach hoher Gesamtintensität nur locker; Intensitätsschwellen und TSS-Steigerung | Bestehende Produktheuristiken. Protokollverträglichkeit, tatsächliche Vorbelastung und Datenqualität prüfen; getrennt von Geräte-/Ausführungsbedingungen überführen. |
| Rad/Puls: feste 10-%-Zonen und pauschale Leistungszuordnung | Herkunft und Zonenmodell zeigen; keine behaupteten physiologischen Schwellen. Schätzungen und mögliche Kalibrierungen erhalten. |
| Laufen: „Distanz vor Tempo“ | Als ausdrücklich gewählte Ausrichtung erhalten. HIIT-Recherche ersetzt keine individuelle Zielentscheidung. |
| Laufen: +10 %/Woche, jede vierte Woche 70 %, Test alle 28 Tage | Als eigene Vorgaben prüfen; keine wissenschaftliche Pflicht oder garantierte Verletzungsvermeidung behaupten. |
| Laufen: Wochenlast aus Rad-/Gymminuten vermindert Laufumfang | Zuerst die tatsächliche Aufrufkette prüfen, dann durch nachvollziehbare gemeinsame Kontextbewertung ersetzen; kein gleichwertiger Minutenreiz. |
| Planer: höchstens zwei harte Tage / eine harte Sache pro Tag | Als vorsichtige bestehende Organisationsheuristik kenntlich machen. Künftige Aufteilung differenziert nach Zielen, lokalen und sportartspezifischen Belastungen. |
| Alte Grundlagen: Pelland als Preprint, keine Supersatz-Metaanalyse | Bibliografie aktualisieren; alte Beschreibung des Ist-Codes nicht versehentlich als neue Policy verwenden. |

Geprüfte Anknüpfungspunkte: `src/coach/guardrails.ts`, `src/coach/coach.ts`, `src/coach/run/limits.ts` und die in der [Code-Recherche](2026-11-06-open-source-training-audit.md) belegten Kraftpfade. Die Tabelle ist kein vollständiger Aufrufkettenaudit der Laufplanung; dieser gehört in den betroffenen Umsetzungsauftrag.

## 11. Grundlagenpaket vor den bisherigen Arbeitsaufträgen

**Entwurfsentscheidung:** Ein vorgeschalteter Auftrag **0: Evidenz- und Policy-Grundlage** liefert ein versioniertes Quellen-/Regelregister, die getrennten Zielbegriffe und den verbindlichen Umgang mit unbekannten Daten. Die folgenden Aufträge implementieren die jeweils dazugehörigen Funktionen schrittweise.

Der Auftrag 0 ist abgeschlossen, wenn:

1. Für Kraft, Hypertrophie, kontinuierliche Ausdauer, HIIT und deren Kombination die hier aufgeführten Aussagen mit Population, Endpunkt, Lesetiefe und Grenzen registriert sind.
2. Jede anfänglich verwendete Zahl als fachliche Orientierung, gewählte Produktpolicy, persönliche Vorgabe oder technische Grenze eingeordnet ist. Die hier vorgeschlagenen Startwerte werden dabei explizit festgelegt oder begründet ersetzt.
3. Ein gemeinsamer Regelvertrag festhält, welche Bedingungen programmatisch prüfbar sind und welche die KI abwägen muss; dieselbe Regelquelle gilt für Prompt, Prüfung, Fallback und Anzeige.
4. Für abweichende bestehende Vorgaben feststeht, in welchem Folgeauftrag sie ersetzt werden und wie Altbestand/Clients weiter funktionieren. Bis dahin werden sie nicht als bereits geändert beschrieben.
5. Die folgenden fachlichen Gegenbeispiele als Abnahmeszenarien zugeordnet sind. Softwaretests überprüfen später diese Vereinbarungen, nicht die biologische Wirksamkeit der App.

| Szenario | Erwartung |
|---|---|
| Gleiches Zeitbudget, Kraftziel gegenüber Muskelaufbauziel | Nachvollziehbar andere Prioritäten und Last-/Wiederholungsbereiche, ohne exklusive biologische Wiederholungsgrenzen. |
| Schwere Sätze mit guten Ergebnissen und RIR 0 | Keine automatische Bestrafung trotz positiver Entwicklung. |
| 18 Wiederholungen ohne RIR | Arbeit bleibt sichtbar; Anstrengung unbekannt. |
| Bereits viel indirekte Armarbeit, begrenzte Wochenzeit | Zusätzliche Isolation wird bewusst begründet oder zugunsten anderer Ziele reduziert. |
| Kleine Ausdauerwoche eines Freizeitprofils | Keine erzwungene 80/20-Quote und kein automatisches HIIT gegen den Wunsch. |
| HIIT bei gleichem FTP-Anker, unterschiedlicher Erfahrung | Nicht ungeprüft identisches Protokoll; vollständige Dosis und Herkunft der Intensität. |
| Kurzes Intervall, Puls noch niedrig | Kein automatisches Hochregeln zur Jagd nach einer Pulszone. |
| 4 × 4 ist zeitlich zu lang einschließlich Vorbereitung/Pausen | Passender anderer Umfang oder anderes Protokoll; kein Weglassen der Nebenzeiten in der Schätzung. |
| Profil mit „Laufen: Distanz vor Tempo“ | Bleibt bei dieser Ausrichtung, bis die Person sie ändert. |
| Warm-up-only Beine, danach gewünschte Ausdauer | Keine pauschale harte Beinvorbelastung. |
| Mehrere anspruchsvolle Unterkörper- und Intervallpläne | Gemeinsame Abwägung und sichtbarer Zielkonflikt; kein unabhängiges Aufaddieren. |
| Eine ungewöhnliche Einheit oder alte Readiness | Keine dauerhafte Zieländerung und keine unbegrenzte Blockierung. |
| Laufdistanzsprung | Einzelne Einheit und Wochenänderung werden unterschieden; keine Garantie „unter 10 % sicher“. |
| Literatur- oder Policywechsel | Versionierter, nachvollziehbarer Übergang; laufende Einheit bleibt stabil. |

Numerische Details wie individuelle Volumenkorridore, Frischefenster und Intervallbibliothek werden in den jeweiligen Umsetzungsaufträgen konkretisiert. Sie dürfen dabei nicht als aus Forschung eindeutig abgeleitet ausgegeben werden. Es wird keine automatische dauernde Internetrecherche bei jeder Planerstellung und keine autonome Änderung der zentralen Policy durch das Sprachmodell eingeführt.

## 12. Quellenregister und Lesetiefe

„Abstract“ bedeutet direkte Prüfung der Zusammenfassung auf PubMed, Verlags- oder Autorenseite; keine vollständige Methoden-/Supplementprüfung. „Volltextauszüge“ bedeutet Prüfung relevanter Textstellen einschließlich ausgewählter Methoden/Ergebnisse, kein unabhängiger Nachvollzug sämtlicher Extraktionen. Allgemeine Fachbegriffe und gewählte Produktentscheidungen wurden nicht als wörtliche Quellenaussagen ausgegeben.

| ID | Quelle | Typ / Lesetiefe | Verwendung und wichtigste Grenze |
|---|---|---|---|
| S01 | [Currier et al., ACSM 2026, DOI 10.1249/MSS.0000000000003897](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/) | Positionsstand / Review-Überblick; Volltextauszüge | Übergreifende Kraft-/Hypertrophierichtung; großer Anteil wenig Trainierter, keine persönliche Optimierungsfunktion. |
| S02 | [Currier et al. 2023, PMID 37414459](https://pubmed.ncbi.nlm.nih.gov/37414459/) | Netzwerkmetaanalyse; Abstract und Volltextauszüge | Last, Sätze, Frequenz; Rangfolge nicht universell überlegen. |
| S03 | [Pelland et al. 2026, PMID 41343037](https://pubmed.ncbi.nlm.nih.gov/41343037/) | Metaanalyse/Metaregression; Abstract | Fraktionales Volumen und abnehmender Zusatznutzen; überwiegend junge Männer, Modell statt gemessener persönlicher Wachstumsanteil. Onlinepublikation Dezember 2025, Heft Februar 2026. |
| S04 | [Lopez et al. 2021, DOI 10.1249/MSS.0000000000002585](https://pmc.ncbi.nlm.nih.gov/articles/PMC8126497/) | Netzwerkmetaanalyse; Abstract und Volltextauszüge | Lastbereiche bei Training bis zum willentlichen Versagen; keine Verallgemeinerung auf beliebig leichte Sätze. |
| S05 | [Robinson et al. 2024, DOI 10.1007/s40279-024-02069-2](https://rke.abertay.ac.uk/en/publications/exploring-the-dose-response-relationship-between-estimated-resist/) | Explorative Metaregression; Abstract auf Autorenseite | RIR-Tendenz; vielfach geschätzte RIR, keine scharfe Grenze. |
| S06 | [Singer et al. 2024, PMID 39205815](https://pubmed.ncbi.nlm.nih.gov/39205815/) | Metaanalyse; Abstract | Satzpausen/Hypertrophie; wenige Studien und erhebliche Unsicherheit. |
| S07 | [Grgic et al. 2018, PMID 28933024](https://pubmed.ncbi.nlm.nih.gov/28933024/) | Systematischer Review; Abstract | Satzpausen/Kraft; ältere Synthese, kein sekundengenaues Optimum. |
| S08 | [Nunes et al. 2021, DOI 10.1080/17461391.2020.1733672](https://onlinelibrary.wiley.com/doi/abs/10.1080/17461391.2020.1733672) | Metaanalyse; Abstract/Befundabgleich mit S01 | Reihenfolge; kein universelles Muskelranking. |
| S09 | [Moesgaard et al. 2022, PMID 35044672](https://pubmed.ncbi.nlm.nih.gov/35044672/) | Metaanalyse; Abstract | Periodisierung; kleine Kraftvorteile unter volumenangeglichenen Bedingungen, keine Pflichtfolge. |
| S10 | [Zhang et al. 2025, PMID 39903375](https://pubmed.ncbi.nlm.nih.gov/39903375/) | Metaanalyse; Abstract | Supersätze, Zeitersparnis, Anstrengung; begrenzte langfristige Daten. |
| S11 | [Ribeiro et al. 2021, DOI 10.6063/motricidade.21143](https://revistas.rcaap.pt/motricidade/article/view/21143) | Systematischer Review; Abstract | Spezifische Vorbereitung/Leistung; kein Verletzungspräventionsnachweis eines Schemas. |
| S12 | [Plotkin et al. 2022, PMID 36199287](https://pubmed.ncbi.nlm.nih.gov/36199287/) | Randomisierte Originalstudie; Abstract | Last- versus Wiederholungsprogression; acht Wochen, kein direkter Test unserer doppelten Progression. |
| S13 | [WHO 2020: Bewegungsempfehlungen für Erwachsene](https://www.who.int/europe/news-room/fact-sheets/item/physical-activity) | Offizielle Leitlinienzusammenfassung | Gesundheitlicher Wochenumfang; kein sportlicher Leistungsoptimierer. |
| S14 | [Lehtonen et al. 2022, PMID 35722045](https://pmc.ncbi.nlm.nih.gov/articles/PMC9185660/) | Kritischer Review; Volltextauszüge | Zugängliche Intensitätssteuerung, Grenzen pauschaler Maximalwertprozente; vorgeschlagener Rahmen. |
| S15 | [Chorley und Lamb 2020, DOI 10.3390/sports8090123](https://pmc.ncbi.nlm.nih.gov/articles/PMC7552657/) | Narrativer Review; Volltextauszüge | FTP, CP und W′ unterscheiden; Modell-/Testgrenzen. |
| S16 | [Oliveira et al. 2024, DOI 10.1007/s40279-024-02034-z](https://link.springer.com/article/10.1007/s40279-024-02034-z) | Metaanalyse; Abstract und Volltextauszüge | Polarisierung, Endpunkt-/Trainingsstatusunterschiede; keine allgemeine 80/20-Pflicht. |
| S17 | [Rosenblat et al. 2025, DOI 10.1007/s40279-024-02149-3](https://dspace.stir.ac.uk/handle/1893/38072) | Individualdaten-Netzwerkmetaanalyse; Abstract auf Autorenseite | Polarisierung/pyramidal; kleine, überwiegend männliche Stichprobe, Subgruppen vorsichtig. |
| S18 | [Li et al. 2026, PMID 42171506](https://pubmed.ncbi.nlm.nih.gov/42171506/) | Netzwerkmetaanalyse; Abstract | Keine eindeutige allgemeine Überlegenheit; Ranking nicht gesicherter Unterschied. |
| S19 | [Poon et al. 2024, DOI 10.1111/sms.14652](https://onlinelibrary.wiley.com/doi/10.1111/sms.14652) | Umbrella-Review; Volltextauszüge | HIIT/CRF, unterschiedliche Populationen und Protokolle; Qualität vieler Reviews niedrig. |
| S20 | [Bi et al. 2026, PMID 41804294](https://pubmed.ncbi.nlm.nih.gov/41804294/) | Metaanalyse; Abstract | HIIT versus kontinuierlich, VO₂max und weitere Endpunkte getrennt; keine universelle Protokolldosis. |
| S21 | [Schoenmakers et al. 2026, PMID 42237396](https://pubmed.ncbi.nlm.nih.gov/42237396/) | Systematischer Review/Metaanalyse; Abstract | Akute Zeit nahe VO₂max; nicht gleich langfristiger Effekt. |
| S22 | [Buchheit und Laursen 2013, DOI 10.1007/s40279-013-0029-x](https://martin-buchheit.net/wp-content/uploads/2018/01/buchheit-laursen-hit-solutions-to-the-programming-puzzle-part-i.pdf) | Programmierungsreview, Autorenfassung; Abstract und Einführung | Stellgrößen des HIIT; kein einzelnes randomisiertes Dosisexperiment. |
| S23 | [Helgerud et al. 2007, PMID 17414804](https://pubmed.ncbi.nlm.nih.gov/17414804/) | Randomisierte Originalstudie; Abstract | Beispiel 4 × 4/kurze Intervalle; 40 moderat trainierte Männer, keine allgemeine Einstiegsvorschrift. |
| S24 | [Übersicht: Unterschiede der Trainierbarkeit und Antwortklassifikation 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8606564/) | Systematischer Review; Volltextauszüge | Messfehler und Schwellen; keine schnelle persönliche Responder-Kategorie. |
| S25 | [The Association Between Running Injuries and Training Parameters, 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9528699/) | Systematischer Review; Abstract und Volltextauszüge | Wöchentliche 10-%-Regel nicht allgemein begründet; heterogene Daten. |
| S26 | [Frandsen et al. 2025, PMID 40623829](https://pubmed.ncbi.nlm.nih.gov/40623829/) | Prospektive Kohorte; Abstract und Volltextauszüge | Distanzsprung einzelner Läufe relativ zu 30 Tagen; Zusammenhang, keine randomisierte sichere Grenze. |

Die Quellenliste wurde für diese fachlichen Aussagen geprüft. Sie ist keine vollständige Bibliografie der Trainingswissenschaft. Eine spätere Erweiterung um konkrete neue Methoden benötigt eine passende Prüfung, bevor sie als wissenschaftlich begründet in die App aufgenommen wird.

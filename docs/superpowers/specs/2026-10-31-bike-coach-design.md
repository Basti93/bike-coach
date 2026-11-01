# Bike Coach: Design

Stand: 31.10.2026. Arbeitsname `bike-coach`.

Herkunft der Aussagen: **[Nutzer]** hat der Nutzer so gesagt oder bestätigt. **[Entscheidung Claude]** ist ein Vorschlag aus dem Gespräch oder eine Festlegung beim Schreiben und kann geändert werden. **[Recherche]** stammt aus der Webrecherche vom 31.10.2026, vor allem aus Community-Quellen, und ist nicht am echten Gerät geprüft.

## 1. Worum es geht

Eine private Trainings-App für zwei Personen auf einem Zwift Hub One. Sie fahren nacheinander oder an verschiedenen Tagen. **[Nutzer]**

Die App vereint vier Dinge:

1. zuverlässige Trainersteuerung und lückenloses Tracking
2. einen KI-Coach, der Einheiten und Langzeitplan erstellt und dynamisch anpasst
3. einen fairen, freundlichen Vergleich trotz sehr unterschiedlicher Wattwerte
4. Unterhaltung: Bergvideos und Sprachenlernen (zuerst Niederländisch, beide bei null, später andere Sprachen)

**Warum:** Erfolg heißt, dass beide regelmäßig und gern aufs Rad gehen und die App viel nutzen. Ein mögliches Auswandern auf Zeit ist Motivation fürs Niederländisch, aber nicht entscheidend. **[Nutzer]**

## 2. Die gute Einheit

Warmup, dann über den Verlauf so fordernd, dass es richtig Spaß macht, aber nie frustriert. Dazu kommen Erfolgsmomente und sichtbarer Fortschritt, beim Training und bei der Sprache. Man sieht, was die andere Person gemacht hat und wo man selbst steht, ohne dass es fies wird. **[Nutzer]**

Vorbild sind die schönsten Rouvy-Fahrten: Bergfahrten mit Auf und Ab und schönen Landschaften. **[Nutzer]**

## 3. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele, nach Priorität** **[Nutzer]**:

1. Keine Fahrt und keine Daten gehen je verloren.
2. Tracking und Langzeitplan stimmen.
3. Die Unterhaltung kommt danach und darf ausfallen. Notfalls läuft nebenbei ein Film, vielleicht auch dauerhaft.

**Nicht-Ziele** **[Entscheidung Claude]**: kein öffentliches Produkt, keine weiteren Nutzer, keine vollwertige Sprachschule, kein Zwift-Klon mit 3D-Welt, zunächst keine iPad-Bluetooth-Anbindung.

**Anti-Ziele. Das wäre ein Fehlschlag, auch wenn es technisch läuft:**
- Eine Fahrt bricht ab und die Daten sind weg. **[Nutzer]**
- Training frustriert, oder der Vergleich fühlt sich fies an. **[Nutzer]**
- Sprachübungen kommen in harten Intervallen. **[Nutzer]**
- Verpasste Tage erzeugen Schuldgefühle oder Nachholdruck. **[Entscheidung Claude]**

## 4. Oberste Regel: Eine Fahrt geht nie verloren

**[Nutzer]** für das Ziel, **[Entscheidung Claude]** für die Umsetzung:

- Die Fahrt hängt nie an Internet, Heimserver, KI oder der Oberfläche.
- Jede Sekunde wird lokal und absturzsicher gespeichert, bevor sie irgendwo anders hingeht. Der Heimserver bekommt die Daten danach und holt nach Ausfällen auf.
- Nach einem Absturz bietet die App an, an derselben Stelle weiterzufahren. Es fehlen höchstens wenige Sekunden.
- Fallen Trainer, Gurt oder Clicker aus, läuft die Fahrt weiter, die App verbindet sich im Hintergrund neu und markiert die Lücke.
- Auch abgebrochene Fahrten werden gespeichert und zählen für Plan und Vergleich.
- Ein neuer Stand der Oberfläche oder des Coachs kann die laufende Aufzeichnung nicht beenden.
- **Abnahme vor der ersten echten Fahrt:** automatisierte und manuelle Tests, die den Prozess bei 80 % hart beenden, die Bluetooth-Verbindung kappen, den Server abschalten und die Oberfläche neu laden. In jedem Fall muss die Fahrt vollständig bis auf wenige Sekunden erhalten bleiben. Wenn der Mac selbst ausfällt, bleibt alles bis kurz davor erhalten.

## 5. Architektur

Alles **[Entscheidung Claude]**, soweit nicht anders markiert.

**Mac-App mit Electron (TypeScript) [Entscheidung Claude, vom Nutzer gewünscht: richtige Anwendung]:** Sie besteht aus zwei streng getrennten Teilen.

- *Fahrdienst:* ein eigener Prozess, klein und selten geändert. Er hält die Bluetooth-Verbindungen, steuert den Trainer, führt die aktuelle Einheit aus und schreibt die Aufzeichnung. Er überlebt jedes Neuladen und jeden Absturz der Oberfläche. Stürzt er selbst ab, startet die App ihn neu und setzt die Fahrt fort.
- *Oberfläche:* Web-Technik im App-Fenster, jederzeit neu ladbar, mit Vollbildmodus und schwebendem Film-Modus (siehe 7).

Reines Web Bluetooth scheidet aus, weil jedes Neuladen die Verbindungen trennen würde. Ob die gewählte Bluetooth-Anbindung im eigenen Prozess zuverlässig läuft, prüft Stufe 0.

**Heimserver (Docker, SQLite):** Profile, Fahrten, Plan und Vergleich. Die KI-Aufrufe des Coachs laufen auf dem Mac. Mac und später iPad nutzen denselben Stand. Der Server ist für eine laufende Fahrt nie nötig. Vor dem Start einer Fahrt holt sich der Fahrdienst die nächste Einheit. Ist der Server nicht erreichbar, nimmt er die zuletzt gespeicherte oder eine einfache lokale Standardeinheit.

**KI [Nutzer]:** Coach und Sprachinhalte laufen über `claude -p`, also das unveränderte Claude Code auf dem Mac mit dem Pro-Login des Nutzers. CLIProxyAPI und LiteLLM werden nicht verwendet. Die App kapselt den Aufruf hinter einer kleinen Schnittstelle, damit ein Wechsel auf einen API-Schlüssel nur diese Stelle betrifft. Die Aufrufe laufen deshalb nur auf dem Mac, nicht auf dem Heimserver. Antworten werden als strukturiertes JSON angefordert (`--output-format json`, `--json-schema`) und gegen die Leitplanken geprüft. Coach-Läufe dürfen keine Dateien ändern und keine Befehle ausführen.

Der Nutzer verwendet seinen Plan für dieses private, nicht kommerzielle Projekt für beide Profile. Das ist seine Entscheidung und wird nicht weiter behandelt.

Bekannte Risiken:
- **Limit:** Coach und Live-Verbesserung teilen sich das Plan-Limit. Ist es erschöpft, gilt der Ablauf aus Abschnitt 8.
- **Technik:** Laut Doku nutzt der Modus `--bare` den Abo-Login nicht und soll künftig Standard für `-p` werden. Der Aufruf muss das berücksichtigen und in einem eigenen Arbeitsordner laufen, damit möglichst wenig von `~/.claude` mitgeladen wird. Ein Test meldet sofort, wenn der Aufruf nach einem Update nicht mehr funktioniert.

**iPad:** zunächst nur als Anzeige und für Auswertungen. Web Bluetooth funktioniert in Safari auf dem iPad nicht **[Recherche]**, aber der Fahrdienst auf dem Mac macht das für die Anzeige überflüssig. Fahren ohne Mac wäre ein späteres eigenes Projekt.

**Serverregeln** (für den eigenen Heimserver):
- Eigener Ordner `~/bike-coach/`, Compose-Name `bike-coach`, eigene `.env`.
- Ports aus `127.0.0.1:7002–7099`, nie `0.0.0.0`.
- `mem_limit` je Dienst; zusammen möglichst deutlich unter den erlaubten rund 2 GiB.
- Zugang über eigenen Tailscale-Sidecar, nur im Tailnet, kein Funnel. Der Auth-Key kommt vom Nutzer.
- Backups in einen eigenen Ordner, Cron nur ergänzen, keine schweren Jobs zwischen 02:00 und 06:00.

## 6. Geräte

**Vorhanden** **[Nutzer]**: Zwift Hub One, Zwift Clicker, Polar-Brustgurt, zwei Garmin-Uhren (auf dem Rad ungenau), iPad, Heimserver. Am Rad steht zunächst ein fester Mac; beide nutzen ihn und wählen in der App ihr Profil. Ein gemeinsames macOS-Konto ist **[Entscheidung Claude]**.

**Trainer** **[Recherche]**: Der Hub One spricht Bluetooth FTMS, das auch andere Apps nutzen. Für ERG-Modus und Steigungssimulation reicht das. Virtuelles Schalten über Zwifts eigenes Protokoll ist nur per Reverse Engineering nutzbar, und beim Hub One gibt es dazu widersprüchliche Berichte aus Rouvy. Wird die Zwift Cog benutzt, kann echtes Schalten nur über dieses Protokoll laufen.

**Schalten** **[Entscheidung Claude]**: Die App simuliert Gänge selbst, indem sie die an den Trainer gesendete Steigung verschiebt. Das Zwift-Protokoll wird nicht benötigt. Wie gut sich das anfühlt, klärt der erste Test.

**Clicker** **[Recherche]**: Offiziell gibt es keine Schnittstelle, aber Reverse-Engineering-Projekte. Die Angaben zum Click v2 widersprechen sich: BikeControl nennt ihn nur „mostly“ unterstützt und braucht teils eine Freischaltung über Zwift, zwiftboard (MIT, nur Windows) liest ihn nach eigener Aussage ohne Freischaltung. Der Auuki-Autor beschreibt eine AES-CCM-Verschlüsselung beim Click. Firmware-Updates können all das brechen. **Deshalb ist der Clicker wichtig, aber nie Voraussetzung für eine Fahrt** **[Entscheidung Claude]**. Ersatz ist die Tastatur und eine Anzeige am Bildschirm. Fällt er aus, schaltet die App in den ERG-Modus oder lässt per Tastatur schalten.

**Puls** **[Entscheidung Claude]**: Primär der Polar-Gurt. Ohne Gurt kann die Fahrt auch ohne Puls laufen, oder eine Garmin-Uhr sendet ihn, falls das Modell das kann (nicht geprüft). Die Leistung vom Trainer ist die Hauptgröße, der Puls ergänzt sie.

**Bedienung beim Start:** Profil wählen, Geräte verbinden sich automatisch, Einheit starten. Fehlt ein Gerät, kann die Fahrt trotzdem beginnen.

**Export:** Jede Fahrt als FIT-Datei, damit sie etwa in Garmin Connect importiert werden kann. Automatischer Upload ist nicht Teil der ersten Stufe. **[Entscheidung Claude]**

## 7. Fahrmodi

**Film-Modus** (ab Stufe 1) **[Nutzer als Idee, Umsetzung Entscheidung Claude]**: kleines Fenster neben einem beliebigen Film, mit Wattvorgabe, Puls, Trittfrequenz, Restzeit und deutlichen Hinweisen vor Wechseln. Keine Sprachübungen. Die Einheit läuft im ERG-Modus, sodass kein Hinsehen nötig ist.

**Berg-Modus** (Stufe 4) **[Entscheidung Claude, auf Basis der Nutzerwünsche]**: Das Gelände strukturiert die Einheit.
- *Anstieg:* fordernd, Musik oder Motivationsvideos, keine Sprache. **[Nutzer]**
- *Gipfel:* Erfolgsmoment mit Aussicht, Bestzeit oder Vergleich zur letzten Fahrt.
- *Abfahrt und Tal:* Erholung, Landschaft und Sprache.

Die Sprache muss nicht zur Landschaft passen. Reine Niederlande-Strecken sind wegen der fehlenden Berge verworfen.

**Steuerung im Berg-Modus [Entscheidung Claude]:** Der Trainer fährt die Steigung des Videos, skaliert pro Person anhand der FTP. Das Video läuft mit dem virtuellen Tempo. Die Skalierung ist so gewählt, dass beide für denselben Anstieg ungefähr gleich lang brauchen. Der Coach legt Strecke, Skalierung und Zielbelastung fest, statt Wattwerte vorzugeben. Die Leitplanken wirken über die Skalierung: Läuft der Puls davon oder liegt die Leistung dauerhaft über der Grenze, senkt der Fahrdienst die Steigung. Gewertet wird die Zeit mit der eigenen Skalierung gegenüber den eigenen früheren Fahrten. Das Format für Einheiten und Aufzeichnung muss beide Arten (Wattvorgabe und skalierte Steigung) von Stufe 1 an abbilden.

## 8. KI-Coach und Plan

**Umfang [Nutzer]:** Die KI erstellt und steuert die einzelnen Einheiten und den langfristigen Plan und dient als Coach. Der Plan passt sich dynamisch an: Die eine Person fährt vielleicht einmal pro Woche, die andere siebenmal.

**Regeln [Entscheidung Claude]:**
- Kein fester Wochenkalender. Beim Aufsteigen schlägt der Coach die Einheit vor, die heute am meisten bringt, und man kann sie leichter, härter oder kürzer machen.
- Verpasste Tage werden nie nachgeholt. Nach Pausen geht es sanft wieder los, bei häufigem Fahren werden genug leichte Einheiten eingebaut.
- Jede Änderung wird in ein bis zwei Sätzen begründet.
- Nach jeder Fahrt gibt es eine kurze Abfrage (zu leicht, genau richtig, zu hart). Sie fließt in den Plan ein.
- Langfristiges Ziel: Regelmäßigkeit und steigende Fitness. Ein eigenes Ziel ist optional ergänzbar.

**Langzeitplan [Nutzer bestätigt]:** Kein Kalender, aber pro Person eine sichtbare Phase (zum Beispiel „Aufbau, noch etwa 3 Wochen“), eine Prognose der FTP-Entwicklung und ein Rückblick, was der Coach warum geändert hat. Der Plan stimmt, wenn die Belastung langsam steigt, die FTP-Prognose ungefähr eintrifft und die meisten Einheiten als „genau richtig“ bewertet werden.

**Freitext [Nutzer bestätigt]:** Ein kurzes Textfeld für Hinweise wie „Knie zwickt“ oder „nächste Woche bin ich weg“. Der Coach berücksichtigt sie und antwortet kurz. Ein voller Chat ist vorerst nicht vorgesehen.

**Daten [Nutzer bestätigt, Zustimmung der zweiten Person vorausgesetzt]:** Die KI bekommt Puls, FTP und Fahrtdaten, aber keine Namen.

**Ausfall der KI [Entscheidung Claude]:** Der Coach erzeugt seine Vorschläge nach der Fahrt und speichert sie vorab. Beim Aufsteigen ist also meist schon eine Einheit da. Ist Claude nicht erreichbar oder das Limit erschöpft, nimmt die App die gespeicherte oder eine regelbasierte Einheit und holt die Auswertung später nach. Eine Fahrt wird dadurch nie blockiert.

**Aufteilung [Entscheidung Claude]:** Die KI plant vor und nach der Fahrt. Während der Fahrt entscheidet der Fahrdienst selbst und ohne KI, etwa die Wattvorgabe zu senken, wenn der Puls davonläuft oder die Trittfrequenz einbricht.

**Leitplanken [Entscheidung Claude]:** Feste Regeln im Code, nicht nur in der KI-Anweisung, begrenzen Vorschläge: maximale Intensität und Steigerung relativ zur FTP, Mindest-Erholung nach harten Einheiten, jederzeit möglicher Abbruch oder Absenken. Die KI erzeugt strukturierte Einheiten, die vor der Annahme geprüft werden. Ungültiges wird verworfen und durch eine Standardeinheit ersetzt.

**Leistungswerte:** Jede Person hat eine eigene FTP. Sie wird durch einen kurzen Rampentest ermittelt und vom Coach fortgeschrieben. **[Nutzer: eigene Werte; Entscheidung Claude: Methode]**

## 9. Vergleich

**Grundsatz [Nutzer]:** Jede Person trainiert nach eigenen Werten. Der Nutzer tritt deutlich mehr Watt, und der Vergleich darf das nicht bestrafen.

**Umsetzung [Entscheidung Claude]:**
- Rangliste nur aus Dingen, die beide gleichermaßen beeinflussen können: Fortschritt gegenüber sich selbst, geschaffte Einheiten, Regelmäßigkeit gemessen am eigenen Rhythmus, gelernte Wörter.
- Dieselbe Strecke oder Einheit wird relativ zur eigenen FTP gewertet.
- Ein gemeinsames Ziel, etwa Höhenmeter für „zusammen auf den Mont Ventoux“.
- Freundliche Sticheleien, keine Niederlagen-Anzeigen. Rohe Wattwerte der anderen Person erscheinen nur, wenn man sie öffnet.

## 10. Sprachenlernen (Stufe 4)

- Sprache in ruhigen Phasen, nie in harten Intervallen; Musik oder Motivationsvideos dort. Die Pulsgrenze dafür legt jede Person fest, die 180 bpm des Nutzers sind ein Beispiel. **[Nutzer]**
- Beide starten bei null. Am Anfang stehen kurze Wörter und Sätze zum Hören und Nachsprechen, Quiz mit dem Clicker oder der Tastatur. Videos mit Untertiteln kommen ab einem höheren Niveau. **[Nutzer: Videos, null Kenntnisse; Entscheidung Claude: Reihenfolge]**
- Ein Sprachplan pro Person, der über Fahrten hinweg wiederholt, was noch nicht sitzt (Wiederholung in Abständen). Sprache ist wählbar, Niederländisch zuerst. **[Entscheidung Claude; Nutzer: andere Sprachen möglich]**
- Die KI erzeugt Inhalte und passt sie an. Ein Lernstand bleibt auch ohne KI nutzbar, indem Inhalte vorab erzeugt und gespeichert werden. **[Entscheidung Claude]**
- Bei Film-Fahrten pausiert das Lernen ohne Strafe. Der Coach kann gelegentlich eine Einheit mit Sprache vorschlagen. **[Entscheidung Claude]**

## 11. Live-Verbesserung auf dem Rad

**[Nutzer]**: In den ersten Fahrten wird die App live beobachtet und gezielt verbessert, während der Nutzer auf dem Rad sitzt und direkt Feedback gibt.

**Umsetzung [Entscheidung Claude]:**
- Claude Code läuft auf dem Mac als Entwickler, unter dem Pro Plan und mit dessen Nutzungslimit. Das ist getrennt vom Coach in der App.
- Er sieht einen laufend geschriebenen Strom aus Watt, Puls, Trittfrequenz, Clicks, Coach-Entscheidungen und Fehlern.
- Der Nutzer gibt Feedback per Sprache. Ein Clicker-Langdruck oder eine Taste markiert den genauen Moment. Die konkrete Sprach-Eingabe ist vom Bauenden zu wählen.
- **Live änderbar:** Oberfläche, Texte, Wattvorgaben der laufenden Einheit innerhalb der Leitplanken, Coach-Anweisungen.
- **Nicht live änderbar:** der Fahrdienst mit Aufzeichnung und Bluetooth. Änderungen daran und größere Umbauten werden notiert und nach der Fahrt umgesetzt.
- Jede Live-Änderung ist sofort rückgängig zu machen.

## 12. Bergvideos (Stufe 4)

**[Recherche]**
- Quelle für den Start: [Van Gestel](https://cycling.vangestel.online/), erste-Person-Fahrten, u. a. Col de Rousset, Col de Menée, Col de Grimone, als MP4 (neuere in AV1), unter CC BY-NC-SA 4.0. Private Nutzung passt dazu, Namensnennung wird in der App angezeigt. Die Dateien werden lokal abgelegt, nicht weiterverteilt.
- Rouvy-Videos sind nicht nutzbar.
- Noch unklar: Wie gut passen Steigungsdaten und Bild zusammen? Lässt sich das Format direkt lesen? Das wird in Stufe 4 mit einem echten Video geprüft.
- Eigene Aufnahmen sind später möglich. Weitere Video-Quellen und Musik: Der Nutzer kann eigene Dateien oder eine parallel laufende Musik-App nutzen; Integration von Streamingdiensten ist nicht vorgesehen. **[Entscheidung Claude]**

## 13. Stufen

Jede Stufe ist für sich fahrbar. **[Nutzer]** für die Priorität, **[Entscheidung Claude]** für den Zuschnitt.

0. **Gerätetest (Wegwerf-Prüfung):** Zuerst Hub One und Polar-Gurt ohne eigenen Code mit Auuki im Chrome prüfen, dann mit eigenem Prüfprogramm: Bluetooth im eigenen Electron-Prozess, Clicker-Modell und -Tasten. Dabei Hub One per FTMS in ERG und Steigungssimulation, Polar-Gurt, Clicker-Tasten, simulierte Gänge am echten Gerät.
1. **Fundament:** Fahrdienst, Aufzeichnung mit allen Abnahmetests aus Abschnitt 4, Profile, manuell gewählte Einheiten, Film-Modus, Live-Verbesserung, Server-Sync, FIT-Export. Der Fahrdienst beherrscht von Anfang an ERG und Steigungssimulation mit simulierten Gängen, und Fahrten ohne Video auf einem Höhenprofil sind möglich. So muss dieser geschützte Teil für Stufe 4 nicht umgebaut werden. **[Entscheidung Claude]** Fühlen sich die Gänge im Gerätetest schlecht an, wird Steigung ohne Schalten gefahren, und ERG bleibt die Grundlage.
2. **Coach:** FTP-Test, Plan, Einheiten, Leitplanken, Abfrage nach der Fahrt.
3. **Vergleich und Fortschritt:** Ansichten, Rangliste, gemeinsames Ziel.
4. **Spaßschicht:** Bergvideos, Sprache, Motivationsvideos, jeweils einzeln abschaltbar.

## 14. Auuki als Referenz

[Auuki](https://github.com/dvmarinoff/Auuki) ist eine aktiv gepflegte Open-Source-App (letzter Commit 30.10.2026, AGPL-3.0) mit FTMS, ERG, Steigungssimulation, ZWO-Einheiten und FIT-Aufzeichnung im Browser. **[Recherche]**

**[Entscheidung Claude]:** Auuki dient als Prüfwerkzeug und Nachschlagewerk, nicht als Grundlage. Die Architektur hängt am Browser, und Wiederherstellen nach einem Absturz ist dort seit 2022 als Wunsch offen ([#95](https://github.com/dvmarinoff/Auuki/issues/95)). Beides widerspricht der obersten Regel. Der Clicker ist dort ebenfalls noch offen ([#181](https://github.com/dvmarinoff/Auuki/issues/181)). Wird Code übernommen, gilt für ihn AGPL. Bei rein privater Nutzung ist das unproblematisch, bei einer späteren Veröffentlichung muss es beachtet werden.

## 15. Dem Bauenden überlassen

- Bluetooth-Bibliothek und Speicherformat, solange Abschnitt 4 erfüllt ist
- Datenmodell, Schnittstellen, Test-Werkzeuge
- Oberflächengestaltung im Rahmen dieses Dokuments
- Konkretes Modell für `claude -p` und Grenzwerte der Leitplanken nach gängiger Trainingspraxis
- Art der Sprachausgabe

## 16. Quellen

- [Road.cc Hub One](https://road.cc/content/review/zwift-hub-one-304467), [Correr una Maratón Hub One](https://www.correrunamaraton.com/zwift-hub-one-review-opinion/)
- [DC Rainmaker: Rouvy und Virtual Shifting](https://www.dcrainmaker.com/2025/02/rouvy-adds-zwift-cog-click-ride-virtual-shifting-battle-royale-begins.html)
- [SHIFTR](https://github.com/doudar/SHIFTR), [BikeControl](https://github.com/OpenBikeControl/bikecontrol), [zwift-joypad-android](https://github.com/rainyx/zwift-joypad-android)
- [Auuki](https://github.com/dvmarinoff/Auuki), [zwiftboard](https://github.com/thomaschampagne/zwiftboard)
- [Claude Code: Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), [Claude Code: Headless](https://code.claude.com/docs/en/headless)
- [Van Gestel Videos](https://cycling.vangestel.online/)

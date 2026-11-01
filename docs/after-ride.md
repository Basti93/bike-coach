# Nach der Fahrt umsetzen

## Wünsche aus der Testfahrt (01.11.2026)

1. **Sanfter Übergang, plötzlich nur auf Wunsch:** Steigungen laufen jetzt über eine Wattvorgabe und beginnen mit 25 s Rampe (am Rad noch ungeprüft). Offen: Einstellung pro Abschnitt für einen plötzlichen Anstieg, vom Coach wählbar, mit Hinweis vorher.
2. **Hinweise, was Plus und Minus bewirken:** Nur noch für Vokabeln nötig: „Plus: Wusste ich · Minus: Nochmal“ nach dem Aufdecken, davor „Gleich kannst du antworten“.
3. **Puls als Teil des Trainings statt nur als Anzeige:**
   - Pulszonen aus Garmin-Daten vorschlagen, Bestätigung auf der Profilseite. Die Pulsgrenze ist keine medizinische Grenze.
   - Zielzone pro Abschnitt mit Live-Anzeige, lockere Einheiten kann der Coach ganz nach Puls steuern.
   - Bleibt der Puls zu lange über Zone oder Grenze, sinken die Watt in kleinen Schritten mit Ansage und bleiben übersteuerbar. Über `maxHrBpm` senkt die Engine heute schon nach 30 s um je 5 %, höchstens 20 %, seit dem Umbau auch in Steigungen.
   - Der Coach bekommt je Abschnitt Zeit in der Zone, Anstieg bei gleicher Leistung und Erholung nach harten Abschnitten.
   - Ohne Gurt läuft die Fahrt nach Watt weiter, die Regelung pausiert, die App zeigt das offen an.
4. **Trittfrequenz (Vorschlag, kein fester Auftrag):** Zielbereiche pro Abschnitt und Coach-Auswertung. Heute nur Anzeige und Aufzeichnung, nicht in `RideSummary`.

## Profil aus dem Garmin-Export (Wunsch vom 01.11.2026, wartet auf das echte ZIP)

- Neues Profil: Garmin-ZIP wählen, Werte vorausfüllen, nur Fehlendes fragen. Das Handformular bleibt als Weg ohne Garmin.
- Die Vorschau zeigt jeden Wert mit Herkunft und bleibt änderbar, gespeichert wird erst nach Bestätigung.
- FTP und Pulsgrenze nie stillschweigend übernehmen: Beide steuern das Training und die Sicherheit. Die Vorsichtsregel der Schätzung (Startwert, `ftpCapW`) bleibt auch mit Garmin-Daten bestehen.
- Weg und Speicherung stehen jetzt in `docs/superpowers/plans/2026-11-01-garmin-daten.md`: `python-garminconnect` statt ZIP, Heimserver nach Bestätigung pro Profil, dem Coach nur knappe Tageswerte.
- Welche Felder im Export stehen, ist ungeprüft: erst am echten ZIP festlegen.


## Einschätzung Coach (31.10.2026, Probelauf ohne echte Fahrt)

Geprüft mit dem echten `claude -p` und zwei erfundenen Rampentests (FTP 210 W und 128 W): Beide Profile erhielten eigene lockere Einheiten um 40 Minuten bei 62–65 % FTP und eine vorsichtige Prognose (rund 1 % pro Monat). Das wirkt vernünftig, belegt aber keine Trainingsqualität. Das zeigen erst echte Wochen.

- Auffällig: Der Text unter „Was der Coach geändert hat“ meldet auch „Keine Änderung“. Solche Einträge sollten nach echten Fahrten geprüft und gegebenenfalls ausgeblendet werden.
- Auffällig: Das Regelwerk schlägt ohne Claude schon zwei Tage nach dem ersten Rampentest 4 × 4 Minuten vor. Für den Einstieg ist das eher zu hart.

## Abgleich mit bewährten Projekten (31.10.2026)

Quellen: Auuki, GoldenCheetah, qdomyos-zwift, BikeControl, clickbridge, wattroom, ZoneBuddy, Claude-Code-Doku. Am echten Hub One ist nichts davon geprüft.

- Eigene Setzung ohne Vorbild: automatische Absenkung (20 s, 30 s, 5 %, −20 %), Intervalle ab 3 Fahrten in 28 Tagen, 0,5 % Steigung je Gang.
- Offen: automatisches Ende des Rampentests (wattroom), Pflichtfelder für den Garmin-Upload, Eigenheiten von noble unter macOS.
- Clicker: Zwift Click erste Generation eingebaut, Verhalten nach BikeControl und zwiftplay, kein Code übernommen. Am echten Gerät ungeprüft. Sehr alte Firmware ist laut zwiftplay verschlüsselt, dann vorher in der Zwift-Companion-App aktualisieren.
- FTP ohne Test: Der Rampentest ist optional, die Schätzung steht in `docs/ftp-estimate.md`. Formeln nur aus Abstracts und Zweitquellen, Kette nicht validiert, Fehler eher über ±22 %. Die Nachzieh-Regel (+5 %/−10 %) ist eigene Setzung.
- Fahrten unter 5 Minuten zählen nicht als Training (eigene Setzung). Verworfene Fahrten bleiben lokal auf der Platte (Status `discarded`), zählen aber nicht, ohne FIT und ohne weiteren Upload. Der Server-Filter dafür ist noch nicht auf dem Heimserver eingespielt.
- Lehren aus Domestique, Apex Velo Lab, Enduragent und ai-cycling-coach (nur Ideen, kein Code): Sensorfilter nur für die Auswertung (bis 2500 W, Puls 25 bis 240, Spitzen bis 2 s über dem 2,5-Fachen des Umfelds und über 400 W), Soll/Ist je Intervall, ein zweiter KI-Versuch, Wochengrenze, gemerkte Regeln. Alle Schwellen sind eigene Setzungen, nicht an echten Fahrten geprüft.
- Zusammen: Jede Fahrminute zählt 10 Höhenmeter (Spielregel, keine Messung), Berge und Höhen sind gerundete Richtwerte. Rangliste ohne Watt und FTP.
- Niederländisch: siehe `docs/language.md`. Die Sprachausgabe ist am echten Mac zu prüfen. In Steigungen erscheinen keine Vokabeln.

## Garmin-Erholung (01.11.2026)

Eigene Setzungen, an echten Wochen zu prüfen: Ruhepuls ≥ 5 bpm über dem 28-Tage-Median an 2 Tagen in Folge, Belastung anderer Sportarten der letzten 3 Tage über dem 1,5-Fachen des Mittels (ab 100 Punkten, damit ein einzelner normaler Lauf nicht warnt), Schlaf unter 5 h nur mit Schlafdaten. Bei „careful“ schlägt das Regelwerk Erholung vor, die KI bekommt die Bewertung als Hinweis. Das Ergebnis wird 5 Minuten zwischengespeichert.

## Motivation durch den Coach (gebaut am 01.11.2026)

Grundlagen und eigene Setzungen in `docs/motivation.md`. Offen: Mit echter KI und über echte Wochen prüfen, ob die Worte passen und die Nachfragen nicht nerven.

# Nach der Fahrt umsetzen

## Profil aus dem Garmin-Export (Wunsch vom 01.11.2026, wartet auf das echte ZIP)

- Neues Profil: Garmin-ZIP wählen, Werte vorausfüllen, nur Fehlendes fragen. Das Handformular bleibt als Weg ohne Garmin.
- Die Vorschau zeigt jeden Wert mit Herkunft und bleibt änderbar, gespeichert wird erst nach Bestätigung.
- FTP und Pulsgrenze nie stillschweigend übernehmen: Beide steuern das Training und die Sicherheit. Die Vorsichtsregel der Schätzung (Startwert, `ftpCapW`) bleibt auch mit Garmin-Daten bestehen.
- Rohdaten nur lokal, kein Heimserver-Sync, dem Coach nur knappe Tageswerte. Jede Person importiert den eigenen Export.
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
- Niederländisch: siehe `docs/language.md`. Die Sprachausgabe ist am echten Mac zu prüfen. Klicks beantworten nur außerhalb von Steigungen, dort schalten sie.

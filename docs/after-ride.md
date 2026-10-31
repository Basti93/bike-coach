# Nach der Fahrt umsetzen


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

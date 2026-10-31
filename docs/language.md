# Niederländisch auf dem Rad

Ziel ist kein Sprachkurs, sondern dass die ruhigen Minuten nebenbei etwas bringen. Fertige Bausteine statt Eigenbau.

| Baustein | Woher | Stand der Belege |
|---|---|---|
| Wiederholungsplan | [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) (MIT), Standardparameter, Ziel 90 % Erinnerung | [Benchmark](https://github.com/open-spaced-repetition/srs-benchmark): sagt das Erinnern besser voraus als SM-2. Hier nur über Zweitquellen gelesen, nicht nachgeprüft, und misst Vorhersage, nicht Lernerfolg |
| Verteilt statt am Stück | Grundidee von FSRS | Kim & Webb 2022, Meta-Analyse zu zweiter Sprache, nur [über eine Arbeit zitiert](https://ir.lib.uwo.ca/etd/8600/) gesehen, Volltext nicht gelesen; Studien meist mit Karteikarten |
| Erst abrufen, dann aufdecken | 6 Sekunden Nachdenken vor der Lösung | Gut belegter Testing-Effekt, hier aus Fachwissen, in dieser Recherche nicht nachgeschlagen. Die 6 Sekunden sind eigene Setzung |
| Lernen beim lockeren Fahren | Nur bis 75 % FTP oder 3 % Steigung, nicht über der eigenen Pulsgrenze | Schmidt-Kassow 2013 und weitere kleine Studien, [zusammengefasst bei Amico & Schaefer 2020](https://www.frontiersin.org/article/10.3389/fpsyg.2020.00684/full): leichtes bis moderates Radfahren beim Lernen half. Wenige Teilnehmende, keine Studie zu genau diesem Ablauf |
| Häufigste Wörter zuerst | [FrequencyWords](https://github.com/hermitdave/FrequencyWords), Untertitel, Inhalt CC-BY-SA-4.0 | Prinzip nach Nation, aus Fachwissen, in dieser Recherche nicht nachgeschlagen |
| Übersetzung und Beispielsatz | Einmalig von Claude erzeugt (`scripts/build-dutch-words.ts`), 683 Karten in `src/shared/dutch-words.json` | Stichprobe von 44 Karten ohne Fehler. **Nicht muttersprachlich geprüft**, einzelne Fehler sind möglich |
| Hören | Systemstimme `nl-NL`, spricht Wort und Satz | Am echten Mac ungeprüft |

Eigene Setzungen ohne Beleg: höchstens 15 neue Wörter pro Tag, „gelernt“ ab 7 Tagen Stabilität, Abstände der Karte während der Fahrt. Nicht beantwortete Karten zählen weder als gewusst noch als falsch.

Offen: Nachsprechen wird nicht geprüft, nur das Verstehen wird abgefragt, nicht das aktive Sagen. Laut Spezifikation kommen Videos erst auf höherem Niveau.

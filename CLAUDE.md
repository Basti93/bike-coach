# Bike Coach

Spec: `docs/superpowers/specs/2026-10-31-bike-coach-design.md`. Oberste Regel: Eine Fahrt geht nie verloren.

## Live-Verbesserung während einer Fahrt

Der Nutzer sitzt auf dem Rad und diktiert Feedback mit der macOS-Diktierfunktion ins Terminal.

- Live lesen: `~/Library/Application Support/bike-coach/rides/live/current.jsonl` (Sekundenwerte, Markierungen, Ereignisse). Markierungen setzt der Nutzer mit Taste `m`.
- Tabu bei offener Fahrt: `src/service/**`, `src/shared/**`, `src/main/**`. Keine Neustarts des Dienstes, kein `npm install`.
- Erlaubt: `src/ui/**` und `npm run live:adjust -- <deltaPct>`; die Leitplanken begrenzen den Wert.
- Jede Änderung ist ein eigener Commit mit Präfix `live:`. Rückgängig: `npm run live:undo`.
- Größere Umbauten kommen nach `docs/after-ride.md` und werden nach der Fahrt umgesetzt.

## Betrieb

- Ohne Rad testen: `npm run dev:sim` simuliert Trainer und Gurt.
- Daten: `~/Library/Application Support/bike-coach/rides/`, FIT-Dateien unter `rides/exports/`.
- Sync zum Heimserver: `~/Library/Application Support/bike-coach/config.json` mit `{"syncUrl": "...", "syncToken": "..."}`. Ohne die Datei läuft alles lokal.
- Andere Geräte koppeln: `rides/devices.json` löschen, solange keine Fahrt läuft.

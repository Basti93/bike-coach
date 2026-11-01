# Garmin-Datenbank

Eine eigenständige SQLite-Datei pro Profil: `~/Library/Application Support/bike-coach/garmin/data/<profileId>/garmin.db`. Sie enthält Garmins Rohdaten als JSON. Neue Auswertungen brauchen daher keinen neuen Abruf. Das Programm `scripts/garmin/garmin_sync.py` kennt die App nicht, die App liest die Datei nur.

## Aufruf

```bash
V="$HOME/Library/Application Support/bike-coach/garmin"
"$V/venv/bin/python" scripts/garmin/garmin_sync.py --tokens "$V/tokens/<profileId>" --db "$V/data/<profileId>/garmin.db"
```

| Option | Wirkung |
|---|---|
| `--max-days 30` | Ältere Tage je Lauf |
| `--max-files 20` | Original-Dateien je Lauf |
| `--reset activities\|daily\|files` | Datenstrom zurückspulen, Daten bleiben und werden überschrieben |
| `--force` | Pause nach einer Sperre übergehen |

Exit-Codes: `0` fertig, `10` Neuanmeldung nötig, `11` Sperre, `12` sonstiger Fehler, z. B. kein Netz. Tests: `npm run test:garmin`.

## Ablauf

Ein Lauf holt Profil, FTP und Geräte, dann die Aktivitäten, dann die letzten 3 Tage und ältere Tage, zuletzt Original-Dateien. Tage warten, bis alle Aktivitäten da sind, Dateien warten auf alle Tage. Jeder Eintrag wird sofort gespeichert. Der Lauf ist beliebig wiederholbar und setzt am Stand aus `sync_state` fort. Ein fehlender Einzelwert steht in `fetch_errors` und wird höchstens 3-mal versucht.

## Tabellen

| Tabelle | Inhalt |
|---|---|
| `daily(date, endpoint, json, fetched_at)` | Tageswerte. Endpunkte: `stats`, `sleep`, `hrv`, `max_metrics`, `training_status`, `training_readiness` |
| `activities(activity_id, start_time, sport, json, fetched_at)` | Aktivitäten, `start_time` in GMT |
| `activity_files(activity_id, format, data, fetched_at)` | Original-Datei als ZIP mit der FIT-Datei |
| `singletons(name, json, fetched_at)` | Aktueller Stand von `profile`, `ftp`, `devices` |
| `sync_state(stream, cursor, complete, updated_at)` | Stand je Strom, `pause` enthält das Ende einer Sperre |
| `fetch_errors(key, error, attempts, at)` | Einzelfehler |
| `sync_runs(id, started_at, ended_at, status, stats)` | Protokoll der Läufe |

## Beispiele

```sql
-- Stunden je Jahr und Sportart
SELECT substr(start_time, 1, 4) AS jahr, sport, ROUND(SUM(json_extract(json, '$.duration')) / 3600, 1) AS stunden
FROM activities GROUP BY jahr, sport ORDER BY jahr, stunden DESC;

-- Ruhepuls der letzten 30 Tage
SELECT date, json_extract(json, '$.restingHeartRate') FROM daily
WHERE endpoint = 'stats' ORDER BY date DESC LIMIT 30;
```

# Bike Coach

*An indoor cycling app for macOS: controls a smart trainer over Bluetooth, records every ride crash-safe and plans the next session with an AI coach. The app, docs and code comments are in German.*

Eine Mac-App für das Indoor-Training auf dem Rad. Sie steuert den Trainer per Bluetooth, zeichnet jede Fahrt absturzsicher auf und plant mit einem KI-Coach die nächste Einheit.

Oberste Regel: Eine Fahrt geht nie verloren. Die Fahrt hängt weder an Internet, Heimserver und KI noch an der Oberfläche.

## Was die App kann

- **Fahren:** Wattvorgabe am Trainer, Steigungsabschnitte mit sanftem Einstieg, Puls und Trittfrequenz live, Übersicht mit Diagrammen nach der Fahrt, FIT-Export.
- **Coach:** Plant die nächste Einheit innerhalb fester Leitplanken, antwortet auf Hinweise, merkt sich Beschwerden und Beweggründe. Ohne KI übernimmt ein Regelwerk.
- **Puls:** Fünf Zonen aus dem Maximalpuls, Anzeige während der Fahrt, Absenkung der Watt in Abschnitten mit gesetzter Zone. Der Puls senkt die Vorgabe nur, er erhöht sie nie.
- **Garmin (optional):** Erholung, andere Sportarten und Profilwerte aus Garmin Connect. Der Zugang ist inoffiziell und kann jederzeit brechen.
- **Mehr:** Niederländisch-Vokabeln in ruhigen Phasen, mehrere Profile, gemeinsame Übersicht, Film-Modus.

Die Trainingsempfehlungen sind keine medizinische Beratung. Grenzen und eigene Setzungen stehen in [`docs/hr-zones.md`](docs/hr-zones.md), [`docs/motivation.md`](docs/motivation.md) und [`docs/ftp-estimate.md`](docs/ftp-estimate.md).

## Voraussetzungen

- macOS auf Apple-Chip und Node.js. Entwickelt wurde mit Node 26.
- Ein Bluetooth-FTMS-Trainer. Geprüft mit Zwift Hub One, Polar-Brustgurt und Zwift Click.
- Für die KI: [Claude Code](https://claude.com/claude-code) als `claude` im Pfad.
- Für Garmin, optional:

  ```bash
  V="$HOME/Library/Application Support/bike-coach/garmin"
  python3 -m venv "$V/venv" && "$V/venv/bin/pip" install garminconnect==0.3.20
  ```

## Starten

```bash
npm install
npm run dev       # mit echten Geräten
npm run dev:sim   # ohne Rad: simuliert Trainer und Gurt
```

Als fertige App bauen und nach `/Applications` installieren, nie bei offener Fahrt:

```bash
npm run app
```

Die App ist nur ad hoc signiert und daher für den eigenen Mac gedacht. Es gibt bewusst keine fertigen Downloads, siehe [`NOTICE.md`](NOTICE.md).

## Prüfen

```bash
npm test            # Haupttests
npm run test:chaos  # Absturz- und Ausfalltests
npm run test:garmin # Garmin-Abruf (Python)
npm run typecheck
```

## Daten

Alles liegt lokal in `~/Library/Application Support/bike-coach/`: Fahrten unter `rides/`, FIT-Dateien unter `rides/exports/`, Coach-Stände unter `coach/`, Garmin-Daten unter `garmin/`. Eine `config.json` mit `syncUrl` und `syncToken` schaltet den optionalen Abgleich mit einem eigenen Server ein ([`server/`](server)). Ohne sie läuft alles lokal.

Ein Backup dieser lokalen Daten macht die App nicht. Die Skripte unter `server/mac/` holen nur die Sicherungen des Servers ab.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/main` | Electron-Hauptprozess, überwacht die Dienste und startet sie neu |
| `src/service` | Fahrdienst: Bluetooth, Aufzeichnung, Fahrlogik |
| `src/coach` | Coach, Garmin-Anbindung, Auswertung |
| `src/ui` | Oberfläche (React) |
| `src/shared` | Gemeinsame Typen und Regeln |
| `scripts/garmin` | Garmin-Abruf in Python |
| `server` | Optionaler Sync-Server (Docker, SQLite) |

Regeln für Änderungen während einer laufenden Fahrt stehen in [`CLAUDE.md`](CLAUDE.md).

## Mitmachen

Siehe [`CONTRIBUTING.md`](CONTRIBUTING.md). Sicherheitslücken bitte nach [`SECURITY.md`](SECURITY.md) melden.

## Lizenz

Der eigene Code steht unter der [MIT-Lizenz](LICENSE). Ausgenommen sind die Wortliste und Abhängigkeiten, siehe [`NOTICE.md`](NOTICE.md).

Dieses Projekt ist unabhängig und steht in keiner Verbindung zu Garmin, Zwift, Polar oder Anthropic. Die Markennamen gehören ihren Inhabern.

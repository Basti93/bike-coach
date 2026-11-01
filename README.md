# Bike Coach

A Mac app for indoor cycling training. It controls the smart trainer over Bluetooth, records every ride crash-safe and plans the next session with an AI coach.

The code and docs are in English. The app's interface and coach texts are in German.

Top rule: A ride is never lost. A ride depends neither on the internet, the home server or the AI, nor on the interface.

## What the app does

- **Riding:** Power targets on the trainer, climb segments with a gentle start, live heart rate and cadence, an overview with charts after the ride, FIT export.
- **Coach:** Plans the next session within fixed guardrails, responds to notes, remembers complaints and motivations. Without AI, a rule set takes over.
- **Heart rate:** Five zones from maximum heart rate, display during the ride, power reduction in segments with a set zone. Heart rate only lowers the target, it never raises it.
- **Garmin (optional):** Recovery, other sports and profile values from Garmin Connect. The access is unofficial and can break at any time.
- **More:** Dutch vocabulary in quiet phases, multiple profiles, a shared overview, movie mode.

The training recommendations are not medical advice. Limits and own settings are described in [`docs/hr-zones.md`](docs/hr-zones.md), [`docs/motivation.md`](docs/motivation.md) and [`docs/ftp-estimate.md`](docs/ftp-estimate.md).

## Requirements

- macOS on Apple silicon and Node.js. Developed with Node 26.
- A Bluetooth FTMS trainer. Built for Zwift Hub One, Polar chest strap and Zwift Click.
- For the AI: [Claude Code](https://claude.com/claude-code) as `claude` on the path.
- For Garmin, optional:

  ```bash
  V="$HOME/Library/Application Support/bike-coach/garmin"
  python3 -m venv "$V/venv" && "$V/venv/bin/pip" install garminconnect==0.3.20
  ```

## Getting started

```bash
npm install
npm run dev       # with real devices
npm run dev:sim   # without a bike: simulates trainer and strap
```

To build the finished app and install it to `/Applications`, never during an open ride:

```bash
npm run app
```

The app is only ad hoc signed and is therefore meant for your own Mac. There are deliberately no prebuilt downloads, see [`NOTICE.md`](NOTICE.md).

## Checks

```bash
npm test            # main tests
npm run test:chaos  # crash and failure tests
npm run test:garmin # Garmin fetch (Python)
npm run typecheck
```

## Data

Everything is stored locally in `~/Library/Application Support/bike-coach/`: rides under `rides/`, FIT files under `rides/exports/`, coach state under `coach/`, Garmin data under `garmin/`. A `config.json` with `syncUrl` and `syncToken` turns on the optional sync with your own server ([`server/`](server)). Without it, everything runs locally.

The app does not back up this local data. The scripts under `server/mac/` only fetch the server's backups.

## Structure

| Folder | Contents |
|---|---|
| `src/main` | Electron main process, monitors the services and restarts them |
| `src/service` | Ride service: Bluetooth, recording, ride logic |
| `src/coach` | Coach, Garmin integration, analysis |
| `src/ui` | Interface (React) |
| `src/shared` | Shared types and rules |
| `scripts/garmin` | Garmin fetch in Python |
| `server` | Optional sync server (Docker, SQLite) |

Rules for changes during a running ride are in [`CLAUDE.md`](CLAUDE.md).

## Contributing

This is a personal project shared as is. Contributions are not being accepted: issues are off and pull requests are limited to collaborators. Forks are welcome under the licence.

To get in touch, write to the owner through their GitHub profile: https://github.com/Basti93. Please report security issues as described in [`SECURITY.md`](SECURITY.md).

## Licence

The project's own code is under the [MIT licence](LICENSE). The word list and dependencies are excepted, see [`NOTICE.md`](NOTICE.md).

This project is independent and not affiliated with Garmin, Zwift, Polar or Anthropic. The trademarks belong to their owners.

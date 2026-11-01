#!/usr/bin/env bash
# Richtet das tägliche Abholen der Server-Sicherungen ein (10:30 Uhr) und startet es einmal.
# Entfernen: launchctl bootout "gui/$(id -u)/de.bike-coach.backup-pull" und die plist löschen.
set -euo pipefail
: "${BACKUP_SERVER:?Aufruf: BACKUP_SERVER=nutzer@host bash server/mac/install-pull.sh}"

LABEL="de.bike-coach.backup-pull"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/pull-backups.sh"
TARGET="$HOME/Backups/bike-coach"

mkdir -p "$TARGET"
cat > "$PLIST" <<E
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$SCRIPT</string></array>
  <key>EnvironmentVariables</key><dict><key>BACKUP_SERVER</key><string>$BACKUP_SERVER</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardErrorPath</key><string>$TARGET/launchd.err</string>
</dict>
</plist>
E
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
bash "$SCRIPT"
tail -1 "$TARGET/pull.log"

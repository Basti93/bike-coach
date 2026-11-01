#!/usr/bin/env bash
# Läuft auf dem Mac: holt die täglichen Sicherungen des Heimservers ab, damit eine Kopie eine kaputte Platte überlebt.
# Abholen statt Schicken: Der Server kann die Kopien auf dem Mac nicht löschen. Aufbau wie bei den anderen Projekten.
# Gestartet von launchd (siehe install-pull.sh), ein Fehler zeigt eine macOS-Mitteilung. Behält KEEP_DAYS Tage.
set -euo pipefail

SERVER="${BACKUP_SERVER:?BACKUP_SERVER setzen, z. B. nutzer@host}"
SOURCE="bike-coach/backups/"
TARGET="${BACKUP_TARGET:-$HOME/Backups/bike-coach}"
KEEP_DAYS="${KEEP_DAYS:-90}"
LOG="$TARGET/pull.log"

mkdir -p "$TARGET"

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Bike-Coach-Backup\"" >/dev/null 2>&1 || true
}

fail() {
  echo "$(date '+%F %T') FAILED: $1" >> "$LOG"
  notify "Backup vom Server fehlgeschlagen: $1"
  exit 1
}

/usr/bin/rsync -a --timeout=120 -e "/usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=20" \
  --include='bike-coach-*.db.gz' --exclude='*' "$SERVER:$SOURCE" "$TARGET/" 2>> "$LOG" \
  || fail "Server nicht erreichbar oder Kopieren gescheitert (Details: $LOG)"

newest=$(/bin/ls -t "$TARGET"/bike-coach-*.db.gz 2>/dev/null | head -1 || true)
[ -n "$newest" ] || fail "keine Datenbanksicherung gefunden"
age_days=$(( ( $(date +%s) - $(stat -f %m "$newest") ) / 86400 ))
[ "$age_days" -le 2 ] || fail "neueste Datenbanksicherung ist $age_days Tage alt"

find "$TARGET" -type f -name 'bike-coach-*.db.gz' -mtime "+$KEEP_DAYS" -delete
echo "$(date '+%F %T') ok, newest $(basename "$newest"), $(du -sh "$TARGET" | cut -f1) in total" >> "$LOG"

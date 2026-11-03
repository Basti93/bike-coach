#!/usr/bin/env bash
# Runs on the Mac: pulls the daily backups from the home server, so that one copy survives a broken disk.
# Pull rather than push: the server cannot delete the copies on the Mac. Same setup as in the other projects.
# Started by launchd (see install-pull.sh); an error shows a macOS notification. Keeps KEEP_DAYS days.
set -euo pipefail

SERVER="${BACKUP_SERVER:?BACKUP_SERVER setzen, z. B. nutzer@host}"
SOURCE="pandafit/backups/"
TARGET="${BACKUP_TARGET:-$HOME/Backups/pandafit}"
KEEP_DAYS="${KEEP_DAYS:-90}"
LOG="$TARGET/pull.log"

mkdir -p "$TARGET"

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Pandafit-Backup\"" >/dev/null 2>&1 || true
}

fail() {
  echo "$(date '+%F %T') FAILED: $1" >> "$LOG"
  notify "Backup vom Server fehlgeschlagen: $1"
  exit 1
}

/usr/bin/rsync -a --timeout=120 -e "/usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=20" \
  --include='pandafit-*.db.gz' --exclude='*' "$SERVER:$SOURCE" "$TARGET/" 2>> "$LOG" \
  || fail "Server nicht erreichbar oder Kopieren gescheitert (Details: $LOG)"

newest=$(/bin/ls -t "$TARGET"/pandafit-*.db.gz 2>/dev/null | head -1 || true)
[ -n "$newest" ] || fail "keine Datenbanksicherung gefunden"
age_days=$(( ( $(date +%s) - $(stat -f %m "$newest") ) / 86400 ))
[ "$age_days" -le 2 ] || fail "neueste Datenbanksicherung ist $age_days Tage alt"

find "$TARGET" -type f -name 'pandafit-*.db.gz' -mtime "+$KEEP_DAYS" -delete
echo "$(date '+%F %T') ok, newest $(basename "$newest"), $(du -sh "$TARGET" | cut -f1) in total" >> "$LOG"

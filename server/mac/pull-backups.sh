#!/usr/bin/env bash
# Runs on the Mac: pulls the daily backups from the home server, so that one copy survives a broken disk.
# Pull rather than push: the server cannot delete the copies on the Mac. Same setup as in the other projects.
# Started by launchd (see install-pull.sh); an error shows a macOS notification. Keeps KEEP_DAYS days.
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

# the server's configuration and credentials (paths relative to the home directory on the server), a new
# server cannot be set up without them; they never go into the repository. A changed file keeps its previous
# version with the time of the pull as suffix; these few small files are kept, KEEP_DAYS does not apply.
SECRETS="$TARGET/secrets"
umask 077
mkdir -p "$SECRETS" && chmod 700 "$SECRETS"
for file in ${SECRET_FILES:-bike-coach/.env}; do
  /usr/bin/rsync -a --backup --suffix=".$(date +%F-%H%M%S)" --timeout=120 \
    -e "/usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=20" "$SERVER:$file" "$SECRETS/" 2>> "$LOG" \
    || fail "Zugangsdatei $file nicht kopiert (Details: $LOG)"
done

find "$TARGET" -type f -name 'bike-coach-*.db.gz' -mtime "+$KEEP_DAYS" -delete
echo "$(date '+%F %T') ok, newest $(basename "$newest"), $(du -sh "$TARGET" | cut -f1) in total" >> "$LOG"

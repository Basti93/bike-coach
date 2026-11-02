#!/bin/sh
# Restore drill: opens the newest backup (or the file given as argument) in a throwaway container,
# prints row counts and removes the container. Never touches the real data: own container, no volume mount of
# the real data, no published port, read-only mount of the backup folder.
set -eu
BACKUP_DIR="${BACKUP_DIR:-$HOME/pandafit/backups}"
case "$BACKUP_DIR" in ""|/|/srv/backups|/srv/backups/*) echo "Invalid BACKUP_DIR: $BACKUP_DIR" >&2; exit 1;; esac
file="${1:-}"
if [ -z "$file" ]; then
  file="$(ls -1t "$BACKUP_DIR"/pandafit-*.db.gz 2>/dev/null | head -n 1 || true)"
fi
[ -n "$file" ] && [ -f "$file" ] || { echo "No backup found in $BACKUP_DIR (pandafit-*.db.gz)." >&2; exit 1; }
gzip -t "$file"
file="$(cd "$(dirname "$file")" && pwd -P)/$(basename "$file")"

name="pandafit-restore-drill-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
echo "Backup: $file, throwaway container: $name"
docker run -d --name "$name" --memory 128m --pids-limit 64 --network none \
  -v "$(dirname "$file"):/backup:ro" node:24-slim sleep 120 >/dev/null
docker exec "$name" sh -c "gunzip -c '/backup/$(basename "$file")' > /tmp/drill.db"
counts="$(docker exec "$name" node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/tmp/drill.db', { readOnly: true });
if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') { console.error('integrity check failed'); process.exit(1); }
for (const t of ['accounts', 'devices', 'sessions', 'records', 'overwritten']) {
  console.log(t + ' ' + db.prepare('SELECT count(*) AS n FROM ' + t).get().n);
}
")"
echo "Rows in the restored backup:"
echo "$counts" | awk '{ printf "  %-12s %s\n", $1, $2 }'
if [ "$(echo "$counts" | awk '$1=="accounts" {print $2}')" = "0" ]; then
  echo "WARNING: 0 accounts. Fresh install or an empty backup?" >&2
fi
mkdir -p "$BACKUP_DIR"
echo "$(date '+%Y-%m-%dT%H:%M:%S%z') restore-drill ok $(basename "$file")" >> "$BACKUP_DIR/drill.log"
echo "Restore drill ok. The container is removed; the real data was not touched."

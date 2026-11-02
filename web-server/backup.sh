#!/bin/sh
# pandafit: daily consistent database backup (VACUUM INTO), kept for 14 days. Cron line is tagged "# pandafit".
set -eu
cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-$HOME/pandafit/backups}"
case "$BACKUP_DIR" in ""|/|/srv/backups|/srv/backups/*) echo "Invalid BACKUP_DIR: $BACKUP_DIR" >&2; exit 1;; esac
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/pandafit-$(date +%Y%m%d-%H%M%S).db.gz"
tmp="$BACKUP_DIR/.data-backup.tmp"
trap 'rm -f "$tmp" "$out.part"' EXIT
docker compose exec -T api node -e "
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
fs.rmSync('/data/backup.db', { force: true });
new DatabaseSync('/data/pandafit.db').exec(\"VACUUM INTO '/data/backup.db'\");
"
docker compose cp api:/data/backup.db "$tmp"
docker compose exec -T api rm -f /data/backup.db
gzip -c "$tmp" > "$out.part"
gzip -t "$out.part"
mv "$out.part" "$out"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pandafit-*.db.gz' -mtime +14 -delete
echo "$(date '+%F %T') ok $out"

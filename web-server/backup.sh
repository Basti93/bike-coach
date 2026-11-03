#!/bin/sh
# pandafit: daily consistent database backup (VACUUM INTO), kept for 14 days. Cron line is tagged "# pandafit".
# Refuses to keep a copy that fails the integrity check or has no accounts.
set -eu
umask 077
cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-$HOME/pandafit/backups}"
case "$BACKUP_DIR" in ""|/) echo "Invalid BACKUP_DIR: $BACKUP_DIR" >&2; exit 1;; esac
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/pandafit-$(date +%Y%m%d-%H%M%S).db.gz"
tmp="$BACKUP_DIR/.data-backup.tmp"
cleanup() {
  rm -f "$tmp" "$out.part"
  docker compose exec -T api rm -f /data/backup.db >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker compose exec -T api node - <<'JS'
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
fs.rmSync('/data/backup.db', { force: true });
new DatabaseSync('/data/pandafit.db').exec("VACUUM INTO '/data/backup.db'");
const copy = new DatabaseSync('/data/backup.db', { readOnly: true });
if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') { console.error('integrity check failed'); process.exit(1); }
if (copy.prepare('SELECT count(*) AS n FROM accounts').get().n === 0) { console.error('backup has no accounts'); process.exit(1); }
JS
docker compose cp api:/data/backup.db "$tmp"
gzip -c "$tmp" > "$out.part"
gzip -t "$out.part"
mv "$out.part" "$out"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pandafit-*.db.gz' -mtime +14 -delete
echo "$(date '+%F %T') ok $out"

#!/bin/sh
# bike-coach: puts a backup of backup.sh back into the volume.   ./restore.sh backups/bike-coach-YYYY-MM-DD.db.gz
# On a new server: .env in place (Mac copy in ~/Backups/bike-coach/secrets), `docker compose up -d`, then this script.
# A database with any row is only replaced with FORCE=1; it is saved first as backups/pre-restore-<time>.db.gz
# (checked; removed after 14 days by backup.sh). Checks integrity and the health of the api afterwards.
set -eu
cd "$(dirname "$0")"
file="${1:?usage: ./restore.sh backups/bike-coach-YYYY-MM-DD.db.gz}"
gzip -t "$file"
run() { docker compose run --rm --no-deps -T "$@"; }
die() { echo "restore: $*" >&2; exit 1; }
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

# exit 0: rows present, 3: no file or no rows (the api creates an empty one at its first start), anything else: stop
state=0
run api node -e "
  const { DatabaseSync } = require('node:sqlite');
  if (!require('node:fs').existsSync('/data/bike-coach.db')) process.exit(3);
  const db = new DatabaseSync('/data/bike-coach.db', { readOnly: true });
  const n = ['rides', 'samples', 'coach', 'events']
    .reduce((s, t) => s + db.prepare('SELECT count(*) AS n FROM ' + t).get().n, 0);
  process.exit(n > 0 ? 0 : 3);" || state=$?
case "$state" in
  0) [ "${FORCE:-}" = 1 ] || die "/data/bike-coach.db holds data; FORCE=1 replaces it (after a copy)"
     mkdir -p backups
     safety="backups/pre-restore-$(date +%Y%m%d-%H%M%S).db.gz"
     run api node -e "
       const { DatabaseSync } = require('node:sqlite');
       require('node:fs').rmSync('/data/pre-restore.db', { force: true });
       new DatabaseSync('/data/bike-coach.db').exec(\"VACUUM INTO '/data/pre-restore.db'\");"
     run api sh -c 'cat /data/pre-restore.db && rm -f /data/pre-restore.db' > "$tmp" || die "copy of the current database failed"
     [ -s "$tmp" ] || die "copy of the current database is empty"
     gzip -c "$tmp" > "$safety" && gzip -t "$safety" || die "$safety is damaged; nothing was replaced"
     echo "current database saved to $safety" ;;
  3) ;;
  *) die "cannot read the current database (exit $state); nothing was replaced" ;;
esac

# unpacked completely first, so an interrupted stream never replaces the database with half a file
gunzip -c "$file" > "$tmp"
docker compose stop api
run api sh -c 'cat > /data/restore.tmp && rm -f /data/bike-coach.db-wal /data/bike-coach.db-shm && mv /data/restore.tmp /data/bike-coach.db' < "$tmp" \
  || die "writing into the volume failed"
run api node -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/data/bike-coach.db', { readOnly: true });
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') { console.error('integrity check failed'); process.exit(1); }
  for (const t of ['rides', 'samples', 'coach', 'events']) console.log(t, db.prepare('SELECT count(*) AS n FROM ' + t).get().n);"
docker compose up -d api
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  curl -sf http://127.0.0.1:7002/health >/dev/null && { echo "restored from $file, api healthy"; exit 0; }
  sleep 5
done
die "api not healthy after 60 s"

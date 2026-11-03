#!/bin/sh
# pandafit: daily backup of the coach volume, kept for 14 days. Cron line is tagged "# pandafit".
# Leaves out all of home/ (including home/.claude, the Claude login: log in again after a restore) and the scratch folder work/.
# Every *.db goes in as a consistent snapshot (VACUUM INTO), made in a staging folder under /data (the memory-backed scratch space is not used).
# Refuses to keep a copy in which a secret is not sealed ("pfs1." prefix) or a plain Garmin token file exists.
# No pipelines between docker and the archive: dash has no pipefail, so every step's exit status is checked on its own.
set -eu
umask 077
cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-$HOME/pandafit/backups}"
case "$BACKUP_DIR" in ""|/) echo "Invalid BACKUP_DIR: $BACKUP_DIR" >&2; exit 1;; esac
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/pandafit-coach-$(date +%Y%m%d-%H%M%S).tar.gz"
raw="$BACKUP_DIR/.coach-backup.tar.tmp"
cleanup() {
  rm -f "$raw" "$out.part"
  docker compose exec -T coach rm -rf /data/.backup-staging >/dev/null 2>&1 || true
}
trap cleanup EXIT
# In the container: refuse unsealed secrets, snapshot the databases, tar everything into the staging folder.
docker compose exec -T coach sh -c '
  set -eu
  cd /data
  bad=0
  for f in accounts/*/hevy/*/api-key accounts/*/garmin/tokens/*/garmin_tokens.json.sealed accounts/*/migrate/incoming/hevy-key accounts/*/migrate/incoming/garmin-tokens; do
    [ -e "$f" ] || continue
    [ "$(head -c 5 "$f")" = "pfs1." ] || { echo "unsealed secret: $f" >&2; bad=1; }
  done
  for f in accounts/*/garmin/tokens/*/garmin_tokens.json; do
    [ -e "$f" ] && { echo "plain Garmin tokens: $f" >&2; bad=1; }
  done
  [ "$bad" = 0 ] || exit 1
  [ -d accounts ] || { echo "no accounts folder" >&2; exit 1; }
  rm -rf .backup-staging
  mkdir -p .backup-staging/snap
  find accounts -type f -name "*.db" | node -e "
    const { DatabaseSync } = require(\"node:sqlite\");
    const fs = require(\"node:fs\"); const path = require(\"node:path\");
    for (const rel of fs.readFileSync(0, \"utf8\").split(\"\\n\").filter(Boolean)) {
      const dest = path.join(\"/data/.backup-staging/snap\", rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const db = new DatabaseSync(path.join(\"/data\", rel), { readOnly: true });
      db.exec(\"VACUUM INTO \x27\" + dest.replace(/\x27/g, \"\x27\x27\") + \"\x27\");
      db.close();
    }"
  # Live files minus databases, then the snapshots. tar exit 1 means a file changed while it was read: fine for text state, a failure otherwise.
  st=0
  tar -cf .backup-staging/all.tar --exclude=./home --exclude=./work --exclude=./.backup-staging --exclude="*.db" --exclude="*.db-wal" --exclude="*.db-shm" -C /data . || st=$?
  [ "$st" -le 1 ] || exit "$st"
  tar -rf .backup-staging/all.tar -C /data/.backup-staging/snap .
'
docker compose exec -T coach cat /data/.backup-staging/all.tar > "$raw"
[ -s "$raw" ] || { echo "empty backup" >&2; exit 1; }
tar -tf "$raw" > "$raw.list"
if ! grep -q '^\./accounts/' "$raw.list"; then rm -f "$raw.list"; echo "backup has no accounts" >&2; exit 1; fi
if grep -q 'home' "$raw.list"; then rm -f "$raw.list"; echo "backup contains home" >&2; exit 1; fi
rm -f "$raw.list"
gzip -c "$raw" > "$out.part"
gzip -t "$out.part"
mv "$out.part" "$out"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pandafit-coach-*.tar.gz' -mtime +14 -delete
echo "$(date '+%F %T') ok $out"

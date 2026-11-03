#!/bin/sh
# Restore drill: starts the real image on a COPY of a backup (newest, or the file given as argument), in a throwaway
# volume and container on a random localhost port, checks /healthz and that account and record counts match the
# backup, then removes everything it created. Production volume, container and port are never touched.
# Needs the image from `docker compose build` (pandafit-api:local, or IMAGE=...).
set -eu
IMAGE="${IMAGE:-pandafit-api:local}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/pandafit/backups}"
case "$BACKUP_DIR" in ""|/) echo "Invalid BACKUP_DIR: $BACKUP_DIR" >&2; exit 1;; esac
file="${1:-}"
if [ -z "$file" ]; then
  file="$(ls -1t "$BACKUP_DIR"/pandafit-*.db.gz 2>/dev/null | head -n 1 || true)"
fi
[ -n "$file" ] && [ -f "$file" ] || { echo "No backup found in $BACKUP_DIR (pandafit-*.db.gz)." >&2; exit 1; }
gzip -t "$file"
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "Image $IMAGE not found; run 'docker compose build' first." >&2; exit 1; }
dir="$(cd "$(dirname "$file")" && pwd -P)"
base="$(basename "$file")"

id="$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
vol="pandafit-drill-$id"
app="pandafit-drill-app-$id"
cleanup() {
  # Safe to run twice (a signal runs it, then EXIT runs it again): every command tolerates "already gone".
  docker rm -f "$app" >/dev/null 2>&1 || true
  docker volume rm "$vol" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'cleanup; trap - EXIT; exit 130' INT
trap 'cleanup; trap - EXIT; exit 143' TERM
trap 'cleanup; trap - EXIT; exit 129' HUP

COUNT_JS="const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') { console.error('integrity check failed'); process.exit(1); }
for (const t of ['accounts', 'devices', 'records']) console.log(t + ' ' + db.prepare('SELECT count(*) AS n FROM ' + t).get().n);"

echo "Backup: $base, throwaway volume: $vol"
docker volume create "$vol" >/dev/null
# Unpack into the throwaway volume as user node (no network). The backup is streamed in on stdin,
# because the file is 0600 and owned by the host user, which the container's node user cannot read.
expected="$(gunzip -c "$dir/$base" | docker run -i --rm --network none --memory 128m --pids-limit 64 -v "$vol:/data" --entrypoint sh "$IMAGE" -c "
  umask 077 && cat > /data/pandafit.db && node -e \"\$0\" /data/pandafit.db" "$COUNT_JS")"
echo "Counts in the backup:"; echo "$expected" | sed 's/^/  /'
case "$expected" in "accounts 0"*) echo "Backup has 0 accounts; refusing to call this a good backup." >&2; exit 1;; esac

docker run -d --name "$app" --memory 256m --cpus 1 --pids-limit 128 --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true -v "$vol:/data" -p 127.0.0.1::8080 "$IMAGE" >/dev/null
port="$(docker port "$app" 8080/tcp | head -n 1 | sed 's/.*://')"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
[ "$ok" = 1 ] || { echo "App did not answer /healthz on the restored copy." >&2; docker logs "$app" 2>&1 | tail -n 20 >&2; exit 1; }
echo "App answers /healthz on 127.0.0.1:$port (throwaway)."
# The app is running on the copy: read the counts through a second reader of the same volume.
actual="$(docker exec "$app" node -e "$COUNT_JS" /data/pandafit.db)"
if [ "$actual" != "$expected" ]; then
  echo "Counts differ after starting the app on the copy:" >&2; echo "$actual" >&2; exit 1
fi
echo "Counts match."
docker exec "$app" node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1], { readOnly: true }); process.exit(db.prepare(\"SELECT 1 FROM meta WHERE key = 'from_backup'\").get() ? 1 : 0);" /data/pandafit.db \
  || { echo "The restored copy did not get a new generation." >&2; exit 1; }
echo "New generation in place."
mkdir -p "$BACKUP_DIR"
echo "$(date '+%Y-%m-%dT%H:%M:%S%z') restore-drill ok $base $(echo "$expected" | tr '\n' ' ')" >> "$BACKUP_DIR/drill.log"
echo "Restore drill ok. Throwaway container and volume are removed; production was not touched."

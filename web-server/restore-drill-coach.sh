#!/bin/sh
# Restore drill for the coach: unpacks a backup (newest, or the file given as argument) into a throwaway volume, starts the
# real image on it with no network and PANDAFIT_COACH_DRY=1 (no scan, no Claude, no Hevy, no Garmin), checks /healthz inside
# the container, checks that no secret is plain text, and removes everything it created. Production is never touched.
# Needs the image from `docker compose build` (pandafit-coach:local, or IMAGE=...). Dummy key and token, no real ones.
set -eu
IMAGE="${IMAGE:-pandafit-coach:local}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/pandafit/backups}"
case "$BACKUP_DIR" in ""|/) echo "Invalid BACKUP_DIR: $BACKUP_DIR" >&2; exit 1;; esac
file="${1:-}"
if [ -z "$file" ]; then
  file="$(ls -1t "$BACKUP_DIR"/pandafit-coach-*.tar.gz 2>/dev/null | head -n 1 || true)"
fi
[ -n "$file" ] && [ -f "$file" ] || { echo "No backup found in $BACKUP_DIR (pandafit-coach-*.tar.gz)." >&2; exit 1; }
gzip -t "$file"
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "Image $IMAGE not found; run 'docker compose build' first." >&2; exit 1; }
dir="$(cd "$(dirname "$file")" && pwd -P)"
base="$(basename "$file")"

id="$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
vol="pandafit-coach-drill-$id"
app="pandafit-coach-drill-app-$id"
cleanup() {
  docker rm -f "$app" >/dev/null 2>&1 || true
  docker volume rm "$vol" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'cleanup; trap - EXIT; exit 130' INT
trap 'cleanup; trap - EXIT; exit 143' TERM
trap 'cleanup; trap - EXIT; exit 129' HUP

echo "Backup: $base, throwaway volume: $vol"
docker volume create "$vol" >/dev/null
# Unpack as user node (no network). The backup is streamed in on stdin, because the file is 0600 and owned by the host user.
gunzip -c "$dir/$base" | docker run -i --rm --network none --memory 128m --pids-limit 64 -v "$vol:/data" --entrypoint sh "$IMAGE" -c \
  'umask 077 && tar -C /data -xf - && ls /data >/dev/null'

# Dummy key and token: the drill never sees the real ones, and in dry mode nothing is opened.
docker run -d --name "$app" --network none -e PANDAFIT_COACH_DRY=1 \
  -e PANDAFIT_SECRET_KEY="$(printf '0%.0s' $(seq 64))" -e PANDAFIT_INTERNAL_TOKEN="$(printf '1%.0s' $(seq 64))" \
  --memory 768m --cpus 1 --pids-limit 256 --read-only --tmpfs /tmp:uid=1000,gid=1000,mode=0700 \
  --tmpfs /run/pandafit-secrets:uid=1000,gid=1000,mode=0700 --cap-drop ALL \
  --security-opt no-new-privileges:true -v "$vol:/data" "$IMAGE" >/dev/null
ok=0
for _ in $(seq 1 30); do
  if docker exec "$app" node -e "fetch('http://127.0.0.1:8090/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
[ "$ok" = 1 ] || { echo "Coach did not answer /healthz on the restored copy." >&2; docker logs "$app" 2>&1 | tail -n 20 >&2; exit 1; }
echo "Coach answers /healthz in the container (dry run, no network)."
# No secret may be plain text in the restored copy.
docker exec "$app" sh -c '
  cd /data; bad=0
  for f in accounts/*/hevy/*/api-key accounts/*/garmin/tokens/*/garmin_tokens.json.sealed; do
    [ -e "$f" ] || continue
    [ "$(head -c 5 "$f")" = "pfs1." ] || { echo "unsealed secret: $f" >&2; bad=1; }
  done
  exit $bad' || { echo "The restored copy holds an unsealed secret." >&2; exit 1; }
accounts="$(docker exec "$app" sh -c 'ls /data/accounts 2>/dev/null | wc -l' | tr -d ' ')"
mkdir -p "$BACKUP_DIR"
echo "$(date '+%Y-%m-%dT%H:%M:%S%z') restore-drill-coach ok $base accounts $accounts" >> "$BACKUP_DIR/drill.log"
echo "Restore drill ok ($accounts account folders). Throwaway container and volume are removed; production was not touched."

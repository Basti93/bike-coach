#!/bin/sh
# pandafit: daily backup of the coach volume, kept for 14 days. Cron line is tagged "# pandafit".
# Leaves out the Claude login (home/.claude, home/.claude.json: log in again after a restore) and the scratch folder work/.
# Refuses to keep a copy in which a secret is not sealed ("pfs1." prefix) or a plain Garmin token file exists.
set -eu
umask 077
cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-$HOME/pandafit/backups}"
case "$BACKUP_DIR" in ""|/) echo "Invalid BACKUP_DIR: $BACKUP_DIR" >&2; exit 1;; esac
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/pandafit-coach-$(date +%Y%m%d-%H%M%S).tar.gz"
cleanup() { rm -f "$out.part"; }
trap cleanup EXIT
# Check first, in the container: the tar stream is only taken when every secret file is sealed.
docker compose exec -T coach sh -c '
  cd /data
  bad=0
  for f in accounts/*/hevy/*/api-key accounts/*/garmin/tokens/*/garmin_tokens.json.sealed; do
    [ -e "$f" ] || continue
    [ "$(head -c 5 "$f")" = "pfs1." ] || { echo "unsealed secret: $f" >&2; bad=1; }
  done
  for f in accounts/*/garmin/tokens/*/garmin_tokens.json; do
    [ -e "$f" ] && { echo "plain Garmin tokens: $f" >&2; bad=1; }
  done
  exit $bad'
docker compose exec -T coach tar -C /data --exclude=./home/.claude --exclude=./home/.claude.json --exclude=./work -cf - . | gzip -c > "$out.part"
gzip -t "$out.part"
tar -tzf "$out.part" >/dev/null
if tar -tzf "$out.part" | grep -q 'home/\.claude'; then echo "backup contains the Claude login" >&2; exit 1; fi
[ -s "$out.part" ] || { echo "empty backup" >&2; exit 1; }
mv "$out.part" "$out"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pandafit-coach-*.tar.gz' -mtime +14 -delete
echo "$(date '+%F %T') ok $out"

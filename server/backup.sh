#!/bin/sh
# bike-coach: tägliche Sicherung der Datenbank, 14 Tage aufbewahren.
set -eu
cd "$HOME/bike-coach"
mkdir -p backups
docker compose exec -T api node -e "
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
fs.rmSync('/data/backup.db', { force: true });
new DatabaseSync('/data/bike-coach.db').exec(\"VACUUM INTO '/data/backup.db'\");
"
docker compose cp api:/data/backup.db data-backup.tmp
gzip -c data-backup.tmp > "backups/bike-coach-$(date +%F).db.gz"
rm -f data-backup.tmp
docker compose exec -T api rm -f /data/backup.db
find backups -name '*.db.gz' -mtime +14 -delete

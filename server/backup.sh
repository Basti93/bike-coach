#!/bin/sh
# bike-coach: tägliche Sicherung der Datenbank, 14 Tage aufbewahren.
set -eu
cd "$HOME/bike-coach"
mkdir -p backups
docker compose exec -T api node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/data/bike-coach.db');
db.exec(\"VACUUM INTO '/data/backup.db'\");
"
gzip -c data/backup.db > "backups/bike-coach-$(date +%F).db.gz"
rm -f data/backup.db
find backups -name '*.db.gz' -mtime +14 -delete

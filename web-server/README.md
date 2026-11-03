# Deploy: Pandafit-Webserver (Heimserver)

Regeln stehen in `~/SERVER.md` auf dem Server. Dienste: `api` (127.0.0.1:7003, vorläufig), `tailscale` (eigener Knoten `pandafit`, Funnel auf 443). RAM-Grenzen: api 256m, tailscale 128m. Alles unten führst du selbst per ssh aus, ohne sudo. Platzhalter: `user@home-server`, `<tailnet>`.

Daten: ein Volume `pandafit_data` (SQLite-Datei `/data/pandafit.db`), Tailscale-Zustand im Volume `pandafit_tsstate`.

## Erster Start

1. Vorab, nur lesen: `ss -tln; docker ps --format '{{.Names}}\t{{.Ports}}'; tailscale serve status; free -h; df -h /`
2. `SERVER.md` ergänzen (Zeilen unten), **bevor** etwas startet. Den vorläufigen Port 7003 mit der Tabelle "Belegte Ports" vergleichen; ist er belegt, einen freien Port wählen und `PANDAFIT_PORT` in `.env` setzen (alle `7003` unten dann ersetzen).
3. Repo kopieren: `rsync -av --exclude node_modules --exclude .git --exclude .worktrees --exclude .claude --exclude release --exclude out --exclude .superpowers --exclude .env ./ user@home-server:pandafit/`
4. `ssh user@home-server`, dann `mkdir -p ~/pandafit/backups && cd ~/pandafit/web-server`
5. `cp .env.example .env && chmod 600 .env && nano .env`. `TS_AUTHKEY` kommt aus der Tailscale-Konsole (Settings, Keys, einmaliger Key). In der ACL braucht der Knoten das `funnel`-nodeAttr, möglichst eng, z. B. `"nodeAttrs": [{"target": ["<dein-login>"], "attr": ["funnel"]}]` (statt `autogroup:member`, das jedes Gerät aller Mitglieder meint); HTTPS-Zertifikate müssen erlaubt sein.
6. Bauen, **nicht zwischen 02:00 und 06:00**: `docker compose build`.
7. Starten: `docker compose up -d`. Dann `docker compose ps`, `curl -s http://127.0.0.1:7003/healthz` (Erwartung `{"ok":true}`) und `docker compose logs tailscale | tail -n 20`. Der Tailscale-Dienst läuft gehärtet (kein Root-Dateisystem-Schreiben, alle Capabilities weg, Userspace-Modus ohne `NET_ADMIN` und ohne `/dev/net/tun`). **Kommt er nicht hoch** (Logs zeigen Schreib- oder Rechtefehler): in `compose.yaml` zuerst `read_only` beim Dienst `tailscale` entfernen, dann bei Bedarf `cap_add: [NET_BIND_SERVICE]`; nie `NET_ADMIN`. Jede Lockerung in `SERVER.md` vermerken.
8. **Key expiry deaktivieren (jetzt, der Knoten `pandafit` existiert erst seit Schritt 7):** Tailscale-Konsole, Machines, beim Knoten `pandafit` "Disable key expiry". Prüfen: in der Liste steht beim Knoten "Expiry disabled" (kein Ablaufdatum). Sonst fällt der Funnel nach ca. 180 Tagen **still** aus.
9. `PANDAFIT_TRUST_PROXY_CIDR` eingrenzen: `docker network inspect pandafit_default` zeigt das Subnetz (z. B. `172.18.0.0/16`). In `.env` eintragen (statt des Standards `172.16.0.0/12`), dann `docker compose up -d api`. Wird das Netz je neu angelegt, ändert sich das Subnetz: dann hier neu eintragen, sonst teilen sich alle Clients ein Login-Limit.
10. **Client-IP prüfen (einmalig, wichtig für das Login-Limit).** Der Server hat kein Debug-Log für Header, der Test geht über das Limit selbst. (a) Vom Handy (Mobilfunk, nicht WLAN) mehrfach ein falsches Login mit einem Namen absetzen, den es nicht gibt (z. B. `x1`), bis 429 kommt. (b) Vom Mac aus einem anderen Netz ein Login mit einem **anderen** Namen (z. B. `x2`): kommt dort **kein** 429, sehen beide Clients getrennte IPs, die Weiterleitung stimmt. Kommt 429, sehen alle dieselbe Adresse (den Proxy): `PANDAFIT_TRUST_PROXY_CIDR` ist zu eng oder falsch, Subnetz aus Schritt 9 prüfen. (c) Spoof-Gegenprobe: mit wechselndem `X-Forwarded-For`-Header (`curl -H 'X-Forwarded-For: 1.2.3.<n>' ...`) weitere falsche Logins mit `x3` absetzen; es muss trotzdem nach der Grenze 429 kommen. Die Sperren laufen nach 15 Minuten von selbst ab.
11. Konten anlegen, Passwörter tippt die Person selbst (kein Echo, nichts landet in der Shell-History): `docker compose exec api web-server/node_modules/.bin/tsx web-server/cli.ts create-account --name <name>` (`exec` ohne `-T`, damit ein Terminal da ist). Für beide Personen wiederholen. Weitere Befehle: `set-password --name`, `list-devices`, `revoke-device --id`, `list-kept --name` (zeigt nur lesend die aufbewahrten Fassungen eines Kontos: je Eintrag bis zu drei überschriebene und jede veraltet gesendete).
12. **Restore einmal ausprobieren, bevor echte Daten drin liegen sollen:** `./backup.sh`, dann `./restore-drill.sh`. Das Skript startet das echte Image auf einer Kopie der Sicherung (Wegwerf-Volume, zufälliger Port auf 127.0.0.1), prüft `/healthz` und dass Konten- und Eintragszahlen mit der Sicherung übereinstimmen, und räumt alles wieder ab. Erst wenn es mit "Restore drill ok" endet, die App benutzen. Zusätzlich einmal im Browser einloggen.
13. Von außen prüfen (Handy im Mobilfunk): `curl -s https://pandafit.<tailnet>.ts.net/healthz` gibt `{"ok":true}`; `curl -si https://pandafit.<tailnet>.ts.net/records` gibt 401; im Browser einloggen und einen Eintrag speichern (POST mit Cookie durch den Proxy).

**So sieht es aus, wenn der Funnel gestorben ist:** `/healthz` lokal (`127.0.0.1:7003`) antwortet, von außen aber Timeout oder Zertifikatsfehler; `docker compose logs tailscale` meldet abgelaufenen Key oder fehlende Funnel-Erlaubnis; in der Konsole steht der Knoten "Expired" oder offline. Abhilfe: Key expiry prüfen (Schritt 8), `funnel`-nodeAttr prüfen, `docker compose restart tailscale`; bei abgelaufenem Key neuen `TS_AUTHKEY` in `.env` und neu starten.

## SERVER.md (Zeilen einfügen)

Belegungstabelle:

| Pandafit (Web-Tracking) | `~/pandafit` | `pandafit` | 127.0.0.1:7003 (api) | Tailscale-Sidecar `pandafit.<tailnet>.ts.net:443`, **Funnel öffentlich** (nur dieser eigene Knoten; Host-Knoten und dessen 443 unberührt) | 06:45 SQLite-Backup (`# pandafit`) | `~/pandafit/backups` (14 Tage) | 384 MiB (api 256m, tailscale 128m) |

Bei "Belegte Ports": `| 7003 | pandafit API | Pandafit |`

## Backup und Cron

Zeile anhängen (Crontab nie ersetzen):
`(crontab -l; echo '45 6 * * * $HOME/pandafit/web-server/backup.sh >> $HOME/pandafit/backups/backup.log 2>&1 # pandafit') | crontab -`

`backup.sh` macht mit `VACUUM INTO` eine konsistente Kopie bei laufendem Server, komprimiert sie nach `~/pandafit/backups/pandafit-<zeit>.db.gz` und löscht dort Sicherungen älter als 14 Tage. Manuell: `./backup.sh`.

**Kopie auf dem Mac (Pull):** einmal auf dem Mac `BACKUP_SERVER=<user@host> web-server/mac/install-pull.sh`. Das legt den LaunchAgent `de.pandafit.backup-pull` an (täglich 10:30, rsync per ssh) und holt die Sicherungen nach `~/Backups/pandafit/` (Log `pull.log`, Mitteilung bei Fehler).

**Restore-Probe (einmal vor der ersten Nutzung, danach monatlich und nach jedem Image-Update):** `./restore-drill.sh [<datei>]` nimmt die neueste Sicherung (oder die angegebene), startet das echte Image auf einer Kopie in einem Wegwerf-Volume (`pandafit-drill-...`, zufälliger Port auf 127.0.0.1, nur Lesezugriff auf den Backup-Ordner), prüft `/healthz`, die Zahlen für Konten, Geräte und Einträge und die neue Generations-ID, und entfernt Container und Volume wieder. Die echten Daten, der laufende Dienst und sein Port bleiben unberührt. Eine Sicherung ohne Konten gilt als fehlgeschlagen.

**Echte Wiederherstellung** (Daten kaputt oder Volume verloren), mit der Datei `~/pandafit/backups/pandafit-<zeit>.db.gz`:
1. `cd ~/pandafit/web-server && docker compose stop api`
2. Besitzer des Volumes richtigstellen (ein Volume, das vor diesem Image angelegt wurde, kann `root` gehören; harmlos, wenn schon richtig): `docker compose run --rm --no-deps --user root --entrypoint chown api -R node:node /data`
3. Sicherheitskopie des jetzigen Stands, **muss gelingen, bevor irgendetwas gelöscht wird** (ein Stopp checkpointet das WAL nicht, die Daten stecken teils in `-wal`). Sie landet in `~/pandafit/backups/pre-restore-<zeit>/` und enthält `pandafit.db` sowie `pandafit.db-wal` und `pandafit.db-shm`, soweit vorhanden: `d=pre-restore-$(date +%Y%m%d-%H%M%S) && docker compose run --rm --no-deps --user root -v ~/pandafit/backups:/backup --entrypoint sh api -ec "mkdir -p /backup/$d; for f in pandafit.db pandafit.db-wal pandafit.db-shm; do if [ -e /data/\$f ]; then cp -p /data/\$f /backup/$d/\$f; fi; done; ls -l /backup/$d"`. Bricht der Befehl ab oder fehlt die Kopie, **hier stoppen** und erst klären (Platz, Rechte); weiter nur, wenn das Volume wirklich leer ist (dann ist der Ordner leer).
4. Einspielen als Benutzer `node` (Modus 0600), erst jetzt die alten Dateien entfernen: `docker compose run --rm --no-deps -v ~/pandafit/backups:/backup:ro --entrypoint sh api -ec 'umask 077; rm -f /data/pandafit.db /data/pandafit.db-wal /data/pandafit.db-shm; gunzip -c /backup/pandafit-<zeit>.db.gz > /data/pandafit.db'`
5. `docker compose up -d api`, dann `curl -s http://127.0.0.1:7003/healthz`, im Browser einloggen. Sitzungen und Gerätetoken aus der Sicherung gelten wieder; was nach der Sicherung entstand, fehlt zunächst: Jedes Gerät sendet beim nächsten Abgleich alles, was es hat, und holt alles neu. Dafür sorgt eine Generations-ID in der Datenbank, die mit jeder Antwort mitkommt. Du musst dafür nichts tun: `backup.sh` markiert jede Sicherung, und beim ersten Öffnen einer markierten Datei entsteht eine neue ID. So geht es auch bei einer zweiten Wiederherstellung derselben Sicherung und ohne einen Schritt, den man vergessen kann; ein Vergleich mit einem gespeicherten Höchststand ginge nicht, denn der läge in derselben Datei und käme mit zurück. Nur wer eine Datei ohne Sicherung zurücklegt (die Kopie aus Schritt 3), ruft danach einmal `new-generation` im CLI auf.

## Betrieb

- Logs: json-file, 3 x 10 MB. Image `tailscale/tailscale:v1.76.1` bewusst manuell anheben.
- Update: neu rsyncen **ohne `serve.json` zu überschreiben, falls du den Kill Switch benutzt hast** (`--exclude serve.json`, sonst ist der Funnel wieder an), `docker compose build` (nicht 02:00 bis 06:00), `docker compose up -d`, danach `./restore-drill.sh`.
- `docker compose stop api` beendet den Prozess sofort (SIGTERM, kein Abwarten offener Anfragen); die Daten sind dank WAL sicher.
- Speicher: api hat 256m, Node ist darin knapp; beim ersten Start `docker stats --no-stream` ansehen.

## Kill Switch

- Sofort aus: `docker compose stop api` (die App arbeitet offline weiter, der Abgleich pausiert).
- Nicht mehr öffentlich: `AllowFunnel` aus `serve.json` entfernen (oder auf `false` setzen), `docker compose restart tailscale`; prüfen: `curl -m 10 -si https://pandafit.<tailnet>.ts.net/healthz` von außen (Mobilfunk) muss scheitern.
- Alles stoppen: `docker compose stop` (Daten bleiben).
- **Nie** `docker compose down -v`, `docker system prune`, `docker volume prune` oder `tailscale reset` auf dem Host (geteilter Server).
- Geheimnis geleckt: `TS_AUTHKEY` in der Konsole widerrufen, Passwörter mit `set-password` ändern (beendet Sitzungen, sperrt Gerätetoken).

# Deploy: Pandafit-Webserver (Heimserver)

Regeln stehen in `~/SERVER.md` auf dem Server. Dienste: `api` (127.0.0.1:7003, vorläufig), `tailscale` (eigener Knoten `pandafit`, Funnel auf 443). RAM-Grenzen: api 256m, tailscale 128m. Alles unten führst du selbst per ssh aus, ohne sudo. Platzhalter: `user@home-server`, `<tailnet>`.

Daten: ein Volume `pandafit_data` (SQLite-Datei `/data/pandafit.db`), Tailscale-Zustand im Volume `pandafit_tsstate`.

## Erster Start

1. Vorab, nur lesen: `ss -tln; docker ps --format '{{.Names}}\t{{.Ports}}'; tailscale serve status; free -h; df -h /`
2. `SERVER.md` ergänzen (Zeilen unten), **bevor** etwas startet. Port 7003 mit der Tabelle "Belegte Ports" vergleichen; ist er belegt, einen freien Port wählen und `PANDAFIT_PORT` in `.env` setzen.
3. Repo kopieren: `rsync -av --exclude node_modules --exclude .git --exclude .worktrees --exclude .claude --exclude release --exclude out --exclude .superpowers --exclude .env ./ user@home-server:pandafit/`
4. `ssh user@home-server`, dann `mkdir -p ~/pandafit/backups && cd ~/pandafit/web-server`
5. `cp .env.example .env && chmod 600 .env && nano .env`. `TS_AUTHKEY` kommt aus der Tailscale-Konsole (Settings, Keys, einmaliger Key). Dort außerdem:
   - beim Knoten `pandafit` **Key expiry deaktivieren** (sonst fällt der Funnel nach ca. 180 Tagen still aus);
   - die ACL braucht das `funnel`-nodeAttr, z. B. `"nodeAttrs": [{"target": ["autogroup:member"], "attr": ["funnel"]}]`; HTTPS-Zertifikate müssen erlaubt sein.
6. Bauen, **nicht zwischen 02:00 und 06:00**: `docker compose build`.
7. Starten: `docker compose up -d`. Dann `docker compose ps`, `curl -s http://127.0.0.1:7003/healthz` (Erwartung `{"ok":true}`) und `docker compose logs tailscale | tail -n 20`.
8. `PANDAFIT_TRUST_PROXY_CIDR` eingrenzen: `docker network inspect pandafit_default` zeigt das Subnetz (z. B. `172.18.0.0/16`). In `.env` eintragen (statt des Standards `172.16.0.0/12`), dann `docker compose up -d api`.
9. **Client-IP prüfen (einmalig, wichtig für das Login-Limit):** Der Server hat kein Debug-Log für Header. Der Test geht über das Limit selbst: Vom Handy (Mobilfunk, nicht WLAN) mit einem Konto-Namen, den es nicht gibt, mehrfach ein falsches Login absetzen, bis die Antwort 429 kommt. Danach vom Mac (anderes Netz) ein Login absetzen: kommt dort **kein** 429, sieht der Server zwei verschiedene Client-IPs, die Weiterleitung stimmt. Kommt auch dort 429, sehen alle Clients dieselbe Adresse (der Proxy): dann ist `PANDAFIT_TRUST_PROXY_CIDR` zu eng oder falsch, Subnetz aus Schritt 8 prüfen. Ist die Variable leer, warnt `docker compose logs api` beim Start. Die Sperre läuft von selbst ab; sie lässt sich auch mit dem CLI-Befehl `set-password` für das Konto löschen.
10. Konten anlegen, Passwörter tippt die Person selbst (kein Echo, nichts landet in der Shell-History): `docker compose exec api web-server/node_modules/.bin/tsx web-server/cli.ts create-account --name <name>` (`exec` ohne `-T`, damit ein Terminal da ist). Für beide Personen wiederholen. Weitere Befehle: `set-password --name`, `list-devices`, `revoke-device --id`.
11. Von außen prüfen (Handy im Mobilfunk): `curl -s https://pandafit.<tailnet>.ts.net/healthz` gibt `{"ok":true}`; `curl -si https://pandafit.<tailnet>.ts.net/records` gibt 401; im Browser einloggen und einen Eintrag speichern (das ist ein POST mit Cookie durch den Proxy).

## SERVER.md (Zeilen einfügen)

Belegungstabelle:

| Pandafit (Web-Tracking) | `~/pandafit` | `pandafit` | 127.0.0.1:7003 (api) | Tailscale-Sidecar `pandafit.<tailnet>.ts.net:443`, **Funnel öffentlich** (nur dieser eigene Knoten; Host-Knoten und dessen 443 unberührt) | 06:45 SQLite-Backup (`# pandafit`) | `~/pandafit/backups` (14 Tage) | 384 MiB (api 256m, tailscale 128m) |

Bei "Belegte Ports": `| 7003 | pandafit API | Pandafit |`

## Backup und Cron

Zeile anhängen (Crontab nie ersetzen):
`(crontab -l; echo '45 6 * * * $HOME/pandafit/web-server/backup.sh >> $HOME/pandafit/backups/backup.log 2>&1 # pandafit') | crontab -`

`backup.sh` macht mit `VACUUM INTO` eine konsistente Kopie bei laufendem Server, komprimiert sie nach `~/pandafit/backups/pandafit-<zeit>.db.gz` und löscht dort Sicherungen älter als 14 Tage. Manuell: `./backup.sh`.

**Kopie auf dem Mac (Pull):** einmal auf dem Mac `BACKUP_SERVER=<user@host> web-server/mac/install-pull.sh`. Das legt den LaunchAgent `de.pandafit.backup-pull` an (täglich 10:30, rsync per ssh) und holt die Sicherungen nach `~/Backups/pandafit/` (Log `pull.log`, Mitteilung bei Fehler).

**Restore-Probe (monatlich):** `./restore-drill.sh [<datei>]` nimmt die neueste Sicherung, öffnet sie in einem Wegwerf-Container (Name `pandafit-restore-drill-...`, kein Netz, kein Port, nur Lesezugriff auf den Backup-Ordner), prüft die Integrität, druckt Zeilenzahlen und entfernt den Container. Die echten Daten bleiben unberührt.

## Betrieb

- Logs: json-file, 3 x 10 MB. Image `tailscale/tailscale:v1.76.1` bewusst manuell anheben.
- `docker compose stop api` wartet bis 15 s.
- Update: neu rsyncen, `docker compose build` (nicht 02:00 bis 06:00), `docker compose up -d`.

## Kill Switch

- Sofort aus: `docker compose stop api` (die App arbeitet offline weiter, der Abgleich pausiert).
- Nicht mehr öffentlich: `AllowFunnel` aus `serve.json` entfernen (oder auf `false` setzen), `docker compose restart tailscale`.
- Alles stoppen: `docker compose stop` (Daten bleiben).
- **Nie** `docker compose down -v`, `docker system prune`, `docker volume prune` oder `tailscale reset` auf dem Host (geteilter Server).
- Geheimnis geleckt: `TS_AUTHKEY` in der Konsole widerrufen, Passwörter mit `set-password` ändern (beendet Sitzungen, sperrt Gerätetoken).

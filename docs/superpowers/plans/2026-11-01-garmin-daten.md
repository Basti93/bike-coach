# Garmin-Daten in Bike Coach – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garmin-Daten laufen automatisch in eine eigenständige lokale Datenbank und machen Profil, Coach-Empfehlung und eine neue Gesundheitsseite besser; alle eigenen Daten bleiben auf einer Profilseite von Hand änderbar.

**Architecture:** Ein eigenständiges Python-Programm spiegelt die Garmin-Rohdaten in eine lokale SQLite-Datenbank pro Profil. Es kennt die App nicht, läuft auch allein, speichert jeden Eintrag sofort und setzt am letzten Stand fort. Die App liest diese Datenbank nur und leitet alles Weitere daraus ab. Der Fahrdienst bleibt unberührt.

**Tech Stack:** `python-garminconnect` 0.3.20 (venv im Datenordner), Python `sqlite3` und `unittest`, TypeScript mit `node:sqlite` (nur lesend), Vitest, React.

**Spec:** Keine eigene Datei. Die Entscheidungen stehen unten, ergänzend gilt `docs/superpowers/specs/2026-10-31-bike-coach-design.md`.

## Befund am echten Konto (01.11.2026, ein Profil, nur Feldnamen gelesen)

| Daten | Stand |
|---|---|
| Geburtsdatum, Geschlecht, Größe, Laktatschwelle | Felder in `userData` vorhanden; Gewicht noch prüfen |
| Ruhepuls | vorhanden |
| FTP | gesetzt, Quelle `CHANGE_LOG`, `isStale` je Abruf prüfen |
| VO2max | allgemein vorhanden, Rad-Wert leer |
| Aktivitäten | 4 in 28 Tagen (Laufen, Wandern), 2 mit Leistung, keine Radfahrt |
| Schlaf | keine Werte: Der Nutzer trägt die Uhr nachts nicht |
| HRV | keine Werte, vermutlich aus demselben Grund (in Task 1 prüfen) |

**Folge:** Keine Funktion darf Schlaf oder HRV voraussetzen. Für die Erholung zählen Ruhepuls und Belastung. Schlaf und HRV werden nur genutzt, falls sie doch einmal vorliegen, etwa beim zweiten Profil.

## Entscheidungen

Stand nach den Vorgaben des Nutzers vom 01.11.2026: alles lokal, Datenschutz vorerst kein Thema, die KI darf nutzen, was Coach, Empfehlungen und Analysen brauchen.

- **Unabhängige Datenbank:** `garmin/data/<profileId>/garmin.db`. Sie enthält Rohdaten, nichts Abgeleitetes. Neue Auswertungen brauchen deshalb keinen neuen Abruf. Das Schema steht in `docs/garmin-data.md`.
- **Wiederholbar und fortsetzbar:** Jeder Eintrag wird sofort gespeichert und per Upsert geschrieben. Der Stand steht pro Datenstrom in `sync_state`. Ein Abbruch an beliebiger Stelle verliert höchstens den laufenden Eintrag; ein erneuter Lauf macht dort weiter.
- **Vollständiger Verlauf:** Zurück bis zum Kontobeginn. Reihenfolge: alle Aktivitäten (100 je Seite, 2 s Pause), Tageswerte (30 Tage je Lauf, 1 s Pause je Abfrage), Original-Dateien (20 je Lauf). Die letzten 3 Tage kommen immer neu. Mengen sind eigene Setzungen.
- **Takt:** Beim Start, solange der Verlauf unvollständig ist alle 3 h, danach alle 6 h, nie bei offener Fahrt. 401/403 → Neuanmeldung nötig, 429 → 6 h Pause.
- **Heimserver:** Vorerst nicht. Die Datenbank ist so eigenständig, dass ein Spiegel später ohne Umbau möglich ist.
- **KI:** Der Coach bekommt alle nützlichen Werte. Die Zusammen-Ansicht zeigt trotzdem keine Gesundheitswerte der anderen Person.
- **Empfehlung statt Zwang:** Die Erholungsbewertung ändert keine Einheit von selbst. Die Leitplanken bleiben wirksam.
- **Schwellen sind eigene Setzungen:** Ruhepuls ≥ 5 bpm über dem 28-Tage-Median an 2 Tagen in Folge, oder Fremdbelastung der letzten 3 Tage über dem 1,5-Fachen des eigenen Mittels. Schlaf unter 5 h zählt nur, falls Schlafdaten vorliegen. Das ist keine Medizin.
- **Nicht Teil dieses Plans:** Upload zu Garmin, Einrichtung der venv auf anderen Rechnern, Token im Schlüsselbund, iPad.

## Global Constraints

- Oberste Regel: Eine Fahrt geht nie verloren. Kein Garmin-Code in `src/service/**`.
- Bei offener Fahrt gilt die Live-Regel aus `CLAUDE.md`: Tasks, die Dienst, `src/shared` oder `src/main` ändern, erst danach umsetzen.
- Fällt Garmin aus, läuft die App weiter und nennt den Stand ehrlich („zuletzt aktualisiert …“).
- Fehlerzustände 401/403 → `reauth`, ohne Wiederholung. 429 → 6 h Pause.
- Das Sync-Programm importiert nichts aus der App und gibt nie Token oder Passwort aus.
- Oberflächentexte auf Deutsch mit korrekten Umlauten, ohne Fachjargon.

## Review Focus

1. **Lücken:** Tage ohne Schlaf, HRV oder Ruhepuls erzeugen weder Absturz noch Fehlalarm. Test in Task 4.
2. **Doppelzählung:** Eine von Bike Coach nach Garmin hochgeladene Fahrt zählt nicht zweimal als Belastung. Test in Task 4.
3. **Abgelaufener Login oder Sperre:** Der Abruf hört auf, die Karte bittet um Neuanmeldung, es gibt keine Anmelde-Schleife. Test in Task 2.
4. **Fahrt beginnt während des Abrufs:** Der Abruf wird beendet, die bisherigen Tage bleiben gespeichert, später geht es weiter. Test in Task 2.
5. **Abbruch mitten im Lauf oder Wiederholung:** Kein Eintrag doppelt, keine Lücke, Fortsetzung am letzten Stand. Test in Task 1.

---

## Task 1: Eigenständiges Sync-Programm

**Files:**
- Create: `scripts/garmin/garmin_sync.py`, `scripts/garmin/test_garmin_sync.py`, `docs/garmin-data.md`
- Modify: `package.json` (`"test:garmin": "python3 -m unittest discover -s scripts/garmin"`)

**Interfaces:**
- Produces:
  - Aufruf: `garmin_sync.py --tokens <dir> --db <datei> [--max-days 30] [--max-files 20] [--force] [--reset <stream>]`. Exit: 0 fertig, 10 Neuanmeldung nötig, 11 Sperre, 12 sonstiger Fehler. Fortschritt als JSON-Zeilen auf stdout.
  - Tabellen: `daily(date, endpoint, json, fetched_at, PK(date, endpoint))`, `activities(activity_id PK, start_time, sport, json, fetched_at)`, `activity_files(activity_id PK, format, data BLOB, fetched_at)`, `singletons(name PK, json, fetched_at)`, `sync_state(stream PK, cursor, complete, updated_at)`, `fetch_errors(key PK, error, at)`, `sync_runs(id PK, started_at, ended_at, status, stats)`.
  - Python: `run_sync(client, db_path, today, limits, sleep, emit) -> int`. Datenströme: `activities`, `daily`, `files`.
  - Tages-Endpunkte: `stats`, `sleep`, `hrv`, `max_metrics`, `training_status`, `training_readiness`. Einmalig je Lauf: `profile`, `ftp`, `devices`.

- [ ] **Step 1: Failing Tests** mit gefälschtem Client (`unittest`):
  - 250 Aktivitäten in drei Seiten werden vollständig und einzeln gespeichert, danach `activities.complete = 1`.
  - **Review Focus 5:** Client wirft mitten in Seite 2; neuer Lauf setzt fort, Ergebnis ist identisch zu einem Lauf ohne Abbruch, keine Duplikate. Zweiter vollständiger Lauf verändert die Zeilenzahl nicht.
  - Nach `complete` werden nur neue Aktivitäten geholt, bis eine ganze Seite bekannt ist.
  - Tage: Immer die letzten 3 neu; rückwärts 30 je Lauf bis `firstDay` (`connectDate` oder älteste Aktivität); Tageswerte erst nach allen Aktivitäten, Dateien erst nach allen Tagen.
  - Einzelfehler eines Endpunkts landet in `fetch_errors`, der Lauf geht weiter, der nächste Lauf versucht ihn erneut und löscht den Eintrag bei Erfolg.
  - 401 → Exit 10, 429 → Exit 11 und `pause_until` in `sync_state`; erneuter Start vor Ablauf tut nichts und liefert 11, `--force` übergeht das. Bis dahin Gespeichertes bleibt.
  - `--reset daily` setzt nur diesen Strom zurück, gelöschte Daten gibt es nicht.
  - Der Quelltext importiert nichts aus dem App-Code.
- [ ] **Step 2:** `npm run test:garmin` → FAIL.
- [ ] **Step 3:** Umsetzen mit `sqlite3` in WAL und Commit nach jedem Eintrag. `docs/garmin-data.md` beschreibt Schema, Aufruf und Beispielabfragen.
- [ ] **Step 4:** `npm run test:garmin` → PASS.
- [ ] **Step 5:** Commit `feat: add a standalone resumable Garmin sync`.

## Task 2: Abruf aus der App steuern

**Files:**
- Create: `src/coach/garmin-sync.ts`, `tests/coach/garmin-sync.test.ts`
- Modify: `src/coach/main.ts`, `src/shared/coach-protocol.ts`, `src/coach/garmin.ts`, `src/ui/views/GarminCard.tsx`, `tests/ui/garmin-card.test.tsx`

**Interfaces:**
- Consumes: Aufruf und Exit-Codes aus Task 1, `findOpenRides`.
- Produces:
  - `class GarminSync({ baseDir, python, script, spawnFn, hasTokens, rideOpen, onUpdate, nowMs })`: `tick(profileId): void`, `info(profileId): GarminSyncInfo`.
  - `type GarminSyncInfo = { running: boolean; lastRunMs: number | null; complete: boolean; problem: 'reauth' | 'rate-limit' | 'failed' | null }`, im `coach-state` als `garminSync`.

- [ ] **Step 1: Failing Tests:**
  - `tick` startet nicht ohne Token, nicht doppelt, nicht bei offener Fahrt, nicht vor Ablauf des Abstands (3 h unvollständig, sonst 6 h).
  - **Review Focus 4:** Wird `rideOpen` während des Laufs wahr, beendet der nächste `tick` den Prozess; Exit-Codes gelten dann nicht als Fehler.
  - **Review Focus 3:** Exit 10 → `problem: 'reauth'`, kein weiterer Start bis neue Token da sind. Exit 11 → `rate-limit`, kein Start vor 6 h.
  - Fehlt Python → `failed`, kein Wurf. Der Stand übersteht einen Neustart.
  - Karte zeigt „Zuletzt aktualisiert“, „Verlauf wird noch geladen“ und bei `reauth` das Anmeldeformular.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Umsetzen; in `scan` abgesichert aufrufen, damit Garmin nie den Coach-Lauf stört. `stderr` wird verworfen.
- [ ] **Step 4:** Tests → PASS, `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat: run the Garmin sync from the app`.
- [ ] **Step 6:** App neu starten (nur ohne offene Fahrt), ersten echten Lauf abwarten und Zählwerte aus der Datenbank prüfen.

## Task 3: Datenbank lesen und normalisieren

**Files:**
- Create: `src/shared/garmin.ts`, `src/coach/garmin-db.ts`, `tests/coach/garmin-db.test.ts`

**Interfaces:**
- Consumes: Tabellen aus Task 1.
- Produces:
  - Typen `GarminDay`, `GarminActivity`, `GarminBody` wie unten, Pfade aus den echten Rohdaten aus Task 2 Step 6.
  - `type GarminDay = { date: string; restingHrBpm: number | null; hrvMs: number | null; sleepS: number | null; deepS: number | null; remS: number | null; sleepScore: number | null; bodyBatteryMax: number | null; stressAvg: number | null; vo2max: number | null; steps: number | null }`
  - `type GarminActivity = { id: string; startMs: number; sport: string; name: string | null; durationS: number; distanceM: number | null; avgHr: number | null; maxHr: number | null; avgPowerW: number | null; normPowerW: number | null; trainingLoad: number | null; aerobicEffect: number | null; fromBikeCoach: boolean }`
  - `type GarminBody = { birthDate: string | null; sex: 'male' | 'female' | 'unknown'; heightCm: number | null; weightKg: number | null; ftpW: number | null; ftpStale: boolean; maxHrSeen: number | null }`
  - `class GarminDb(file)`: `days(fromDate): GarminDay[]`, `activities(fromMs): GarminActivity[]`, `body(): GarminBody | null`, `progress(): { activities: number; activitiesComplete: boolean; daysDone: number; daysTotal: number; filesDone: number; filesTotal: number }`. Öffnet nur lesend; fehlende Datei ergibt leere Ergebnisse.

- [ ] **Step 1: Failing Tests** mit einer Test-Datenbank aus dem Schema von Task 1:
  - Vollständiger Tag liefert alle Werte; `{}`, `[]`, `null` ergeben `null`, kein Wurf; `sleepS` ist `null` statt 0.
  - Aktivität: `activityType.typeKey` → `sport`, `beginTimestamp` → `startMs`, ohne Leistung `avgPowerW === null`.
  - `isStale: true` → `ftpStale`, `gender: 'MALE'` → `male`, Unbekanntes → `unknown`.
  - Fehlende Datei → leere Listen und `null`. Lesen während eines laufenden Schreibvorgangs wirft nicht.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** Tests → PASS, `npx tsc --noEmit`, `npm run build` (prüft `node:sqlite` im Coach-Bündel).
- [ ] **Step 5:** Commit `feat: read the Garmin database`.

## Task 4: Erholung und Coach

**Files:**
- Create: `src/coach/readiness.ts`, `tests/coach/readiness.test.ts`, `src/ui/views/ReadinessNote.tsx`
- Modify: `src/coach/coach.ts` (`buildPrompt`, Zeile 346 ff.; `context`), `src/coach/rules.ts`, `src/ui/views/CoachView.tsx`, `tests/coach/coach.test.ts`, `docs/after-ride.md`

**Interfaces:**
- Consumes: `GarminDb`, `RideSummary`.
- Produces:
  - `assessReadiness(days: GarminDay[], today: string): { level: 'normal' | 'careful' | 'unknown'; reasons: string[] }`
  - `externalLoad(activities: GarminActivity[], rides: RideSummary[], nowMs: number): { sport: string; startMs: number; durationS: number; trainingLoad: number | null }[]`
  - `historySummary(activities: GarminActivity[]): { monat: string; sport: string; anzahl: number; stunden: number; belastung: number | null }[]`
  - `garminPromptData(days, activities, rides, today): object` mit Tageswerten von 14 Tagen, Bewertung, Fremdbelastung und `historySummary`.
  - `coach-state` trägt `readiness`.

- [ ] **Step 1: Failing Tests:**
  - Ruhepuls 5 bpm über dem Median an 2 Tagen in Folge → `careful`, mit Begründung. Nur 1 Tag → `normal`. Fremdbelastung der letzten 3 Tage über dem 1,5-Fachen des eigenen Mittels → `careful`. Schlaf 4,5 h letzte Nacht → `careful`, falls vorhanden.
  - Über Jahre ohne Schlafdaten bleibt die Bewertung aus Ruhepuls und Belastung gültig, ohne Hinweis auf fehlenden Schlaf.
  - `historySummary`: 8 Jahre Aktivitäten ergeben eine knappe Monatsliste; die Länge des Prompts bleibt unter 20 kB.
  - **Review Focus 1:** Weniger als 14 Tage Ruhepuls → `unknown`, nicht `normal`. Nur `null`-Tage → kein Wurf, keine Begründung.
  - **Review Focus 2:** Aktivität mit `fromBikeCoach: true` oder ±10 min Startzeit-Überlappung mit einer Fahrt und passender Dauer fällt aus `externalLoad` heraus; ein Lauf am selben Tag bleibt.
  - `buildPrompt`: Enthält bei Garmin-Daten den Abschnitt; ohne Garmin-Daten bleibt der Prompt byte-gleich zu heute.
  - `together`: Die Zusammen-Ansicht enthält keinen Garmin-Wert.
  - Regelwerk: Bei `careful` schlägt `ruleBasedSession` keine Intervalle vor.
- [ ] **Step 2:** Tests ausführen → FAIL.
- [ ] **Step 3:** Umsetzen. Der Prompt erhält den Hinweis, dass Werte einer Uhr ungenau sein können und Empfehlungen keine Diagnosen sind. `ReadinessNote` zeigt bei `careful` „Heute eher locker? …“ mit Grund und ändert selbst nichts. Schwellen in `docs/after-ride.md` als eigene Setzung vermerken.
- [ ] **Step 4:** Tests → PASS, zusätzlich `npm run coach:check` mit dem echten Claude.
- [ ] **Step 5:** Commit `feat: let Garmin recovery data inform the coach`.

## Task 5: Profilseite zum Selbsteinstellen

Unabhängig von Garmin nutzbar. Heute lässt sich ein Profil nach dem Anlegen nicht mehr ändern.

**Befund im Code:** `save-profile` schreibt nur `profiles.json`. Die gültige FTP steht aber im Coach-Stand (`CoachState.ftpW`) und wird nur beim ersten Laden aus dem Profil übernommen. Eine FTP-Änderung braucht deshalb einen eigenen Weg über den Coach.

**Files:**
- Create: `src/ui/views/ProfileSettingsView.tsx`, `tests/ui/profile-settings.test.tsx`
- Modify: `src/shared/profiles.ts`, `src/shared/coach-protocol.ts`, `src/coach/coach.ts`, `src/coach/main.ts`, `src/ui/App.tsx`, `src/ui/views/CoachView.tsx`, `tests/coach/coach.test.ts`

**Interfaces:**
- Produces:
  - `Profile` zusätzlich optional: `birthDate?: string` (`YYYY-MM-DD`), `sex?: 'male' | 'female' | 'unknown'`, `heightCm?: number`, `weightKg?: number`. Alte `profiles.json` bleiben gültig.
  - `{ type: 'set-ftp'; profileId: string; ftpW: number }` und `Coach.setFtp(profileId: string, ftpW: number): void`: setzt `ftpW`, schreibt `ftpHistory` mit Quelle `manual`, markiert `dirty`.
  - `ProfileSettingsView({ profile, ftpW, garmin, sendRide, sendCoach, onBack })`.

**Entscheidungen:**
- Eine Eingabe von Hand gewinnt immer: Der Garmin-Abruf schreibt nie ins Profil, Änderungen kommen nur über die Prüfung aus Task 6.
- Eine von Hand gesetzte FTP entfernt `ftpCapW`, weil diese Obergrenze nur für die Schätzung ohne Messung gilt und den Wert sonst später wieder drücken würde.
- Die Seite ist bei offener Fahrt nicht erreichbar.

- [ ] **Step 1: Failing Tests:**
  - Seite zeigt Name, Geburtsdatum, Geschlecht, Größe, Gewicht, FTP und Pulsgrenze mit den aktuellen Werten; die FTP stammt aus dem Coach-Stand, nicht aus dem Profil.
  - Speichern sendet `save-profile` mit derselben `id` und allen unveränderten Feldern; `set-ftp` geht nur bei geänderter FTP raus, dann ohne `ftpCapW` im Profil.
  - Ungültig (leerer Name, FTP unter 50, Größe außerhalb 120–230, Gewicht außerhalb 30–250, Geburtsdatum in der Zukunft oder Alter unter 14) sperrt das Speichern und nennt das Feld. Leere optionale Felder werden entfernt.
  - Pulsgrenze leeren entfernt `maxHrBpm`. Änderungen an der FTP zeigen den Hinweis, dass der Coach neu plant.
  - `Coach.setFtp`: `state.ftpW` und `ftpHistory` stimmen, Wert bleibt nach Neuladen; alte `profiles.json` ohne neue Felder lädt fehlerfrei.
  - Die Seite ist in `CoachView` über „Profil bearbeiten“ erreichbar, in der Fahrtansicht nicht.
- [ ] **Step 2:** Tests ausführen → FAIL.
- [ ] **Step 3:** Umsetzen. `save-profile` bleibt unverändert und schreibt weiter atomar. Für den Fahrdienst ändert sich nur das Schema, deshalb erst ohne offene Fahrt einspielen.
- [ ] **Step 4:** Tests → PASS, `npx tsc --noEmit` → keine Fehler.
- [ ] **Step 5:** Commit `feat: add a profile page to edit your own data`.

## Task 6: Profil aus Garmin

**Files:**
- Create: `src/shared/garmin-profile.ts`, `tests/shared/garmin-profile.test.ts`, `src/ui/views/GarminProfileReview.tsx`, `tests/ui/garmin-profile-review.test.tsx`
- Modify: `src/ui/views/ProfileView.tsx`, `src/ui/views/CoachView.tsx`, `src/ui/App.tsx`, `src/coach/main.ts`, `src/shared/coach-protocol.ts`

**Interfaces:**
- Consumes: `GarminBody`, `GarminActivity`, `estimateFtp`, `ACTIVITY_LEVELS`, Profilfelder und `set-ftp` aus Task 5.
- Produces:
  - `suggestProfile(body: GarminBody, activities: GarminActivity[], nowMs: number): { age: number | null; sex: Sex; heightCm: number | null; weightKg: number | null; activity: number | null; run5kMin: number | null; ftp: { startW: number; source: 'garmin' | 'estimate'; capW?: number } | null; maxHrBpm: number | null; missing: string[] }`
  - `coach-state.garminBody`, wenn verfügbar.
  - Ablauf für neue Profile: `ProfileView` erzeugt die Profil-ID vorab; `App` übergibt sie als `pendingProfileId` an `useCoach`, damit Anmeldung und Abruf schon vor dem Speichern laufen.

- [ ] **Step 1: Failing Tests:**
  - Alter aus `birthDate` auch vor und nach dem Geburtstag korrekt.
  - FTP gesetzt, nicht veraltet → `source: 'garmin'`. `ftpStale` oder keine FTP → `source: 'estimate'` über `estimateFtp`, mit `capW`.
  - Bestwert über 5 km nur aus echten Läufen mit mindestens 5 km und höchstens 180 Tage alt, sonst `null`.
  - `maxHrBpm` kommt nur mit `missing`-freiem Hinweis „Bitte bestätigen“, Werte über 240 werden verworfen.
  - Fehlende Werte stehen in `missing`; die Review-Ansicht fragt nur diese ab.
  - Review: Nichts wird ohne Klick auf „Übernehmen“ gesendet; jeder Wert zeigt seine Herkunft und bleibt änderbar; das Handformular bleibt erreichbar.
- [ ] **Step 2:** Tests ausführen → FAIL.
- [ ] **Step 3:** Umsetzen. Bei bestehenden Profilen zeigt die Garmin-Karte „Werte aus Garmin prüfen“; Übernahme nutzt `save-profile`, eine FTP-Änderung geht über `set-ftp`. Die Prüfung zeigt Abweichungen als „Garmin: 81 kg, bei dir: 80 kg“; ohne Klick bleibt der eigene Wert. Danach bleibt alles auf der Profilseite aus Task 5 änderbar. Der Sicherheitshinweis aus dem Formular bleibt sichtbar.
- [ ] **Step 4:** Tests → PASS, `npx tsc --noEmit` → keine Fehler.
- [ ] **Step 5:** Commit `feat: fill the profile from Garmin`.

## Task 7: Gesundheitsseite

**Files:**
- Create: `src/ui/views/HealthView.tsx`, `tests/ui/health-view.test.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/views/CoachView.tsx`, `src/ui/style.css`, `src/shared/coach-protocol.ts`, `src/coach/main.ts`

**Interfaces:**
- Consumes: `GarminDb`, `externalLoad`, `assessReadiness`.
- Produces: `{ type: 'garmin-health'; profileId: string; days: number }` mit Antwort `{ type: 'garmin-health'; days: GarminDay[]; activities: GarminActivity[] }`; `HealthView({ days, activities, readiness, lastSyncMs, onBack })`.

- [ ] **Step 1:** Skill `dataviz` laden, bevor Diagramme entstehen.
- [ ] **Step 2: Failing Tests:**
  - Zeigt Ruhepuls, VO2max und Belastung als Verlauf über 7, 28 und 90 Tage, 1 Jahr und gesamt; Aktivitäten je Monat und Sportart über alle Jahre; Schlaf und HRV nur mit Daten.
  - Zeigt den Fortschritt des Altbestands aus `GarminDb.progress`, solange er läuft.
  - Fehlt eine Datenart ganz, entfällt das Diagramm; ein kurzer Hinweis „Keine Daten von deiner Uhr“ reicht.
  - Zeigt „Zuletzt aktualisiert“ und bei `reauth` den Weg zur Anmeldung.
  - Knopf „Gesundheit“ erscheint in `CoachView` nur bei verbundenem Garmin, nie in der Fahrtansicht und nie in `TogetherView`.
  - Hinweis sichtbar: „Trends aus deiner Uhr, keine medizinische Auswertung.“
- [ ] **Step 3:** Tests ausführen → FAIL.
- [ ] **Step 4:** Umsetzen, dazu Zusammenhang „Ruhepuls vor der Fahrt gegen Bewertung der Fahrt“ erst ab 10 gemeinsamen Datenpunkten zeigen. Bei Jahresansichten im Coach verdichten, nicht alle Tage an die Oberfläche schicken.
- [ ] **Step 5:** Tests → PASS, Gesamtlauf `npm test`, `npx tsc --noEmit`, dann `npm run test:chaos`, weil der Coach-Prozess neue Aufgaben hat und die Fahrt unbeeinflusst bleiben muss.
- [ ] **Step 6:** In der App mit echten Daten ansehen und per Screenshot belegen; dem Nutzer melden, falls das Fenster nicht erfasst werden kann.
- [ ] **Step 7:** Commit `feat: add a health page from Garmin data`.

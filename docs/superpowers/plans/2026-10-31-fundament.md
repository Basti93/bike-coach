# Bike Coach: Gerätetest und Fundament (Stufe 0 und 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Mac-App, mit der beide Personen manuell gewählte Einheiten absturzsicher fahren, aufzeichnen, exportieren und auf den Heimserver übertragen können.

**Architecture:** Electron-App mit zwei getrennten Teilen: Ein Fahrdienst in einem `utilityProcess` hält Bluetooth, Einheit und Aufzeichnung; eine jederzeit neu ladbare Oberfläche spricht per lokalem WebSocket mit ihm. Die Aufzeichnung ist eine Append-only-Datei auf dem Mac, und der Heimserver bekommt die Daten nachträglich und idempotent.

**Tech Stack:** TypeScript, Node, Electron, electron-vite, React, `@stoprocent/noble` (in Task 2 zu bestätigen), `zod`, `ws`, Vitest, Fastify, `better-sqlite3`, `@garmin/fitsdk`, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-31-bike-coach-design.md`

Stufen 2 bis 4 (Coach, Vergleich, Spaßschicht) bekommen eigene Pläne, nachdem Stufe 1 auf dem echten Rad gelaufen ist.

## Global Constraints

- Oberste Regel: Keine Fahrt und keine Daten gehen je verloren. Eine Fahrt hängt nie an Internet, Heimserver, KI oder Oberfläche.
- Jede Sekunde wird lokal und absturzsicher gespeichert, bevor sie irgendwo anders hingeht. Nach einem Absturz fehlen höchstens wenige Sekunden.
- Fällt ein Gerät aus, läuft die Fahrt weiter, die App verbindet neu und markiert die Lücke.
- Abgebrochene Fahrten werden gespeichert und zählen.
- Clicker und Puls sind nie Voraussetzung für eine Fahrt; Tastatur ist der Ersatz fürs Schalten.
- Der Fahrdienst wird während einer Fahrt nie live geändert.
- Server: Ordner `~/bike-coach/`, Compose-Name `bike-coach`, Ports aus `127.0.0.1:7002–7099`, nie `0.0.0.0`, `mem_limit` je Dienst (zusammen unter 512m), eigener Tailscale-Sidecar ohne Funnel, eigener Backup-Ordner `~/bike-coach/backups`, Cron nur ergänzen mit Kommentar `# bike-coach`, keine schweren Jobs 02:00–06:00. Vor Inbetriebnahme in die Belegungstabelle von `~/SERVER.md` eintragen.
- Geheimnisse (Tailscale-Key, Sync-Token) nur in `.env` mit Rechten 600, nie im Repository.
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_013UaCPTKUHvZz5EkeAhjh96`.
- Oberflächentexte auf Deutsch mit korrekten Umlauten.

## Review Focus

1. Mac schläft während einer Film-Fahrt ein oder der Deckel wird kurz geschlossen: Der Ruhezustand wird während der Fahrt verhindert, die Zeit danach wird als Lücke markiert und nicht als gefahrene Zeit gezählt. (Task 7, Task 8)
2. Festplatte voll oder Schreibfehler: Die Fahrt läuft weiter, die Oberfläche warnt deutlich, und Daten bleiben im Speicher, bis Schreiben wieder geht. (Task 4)
3. Nach einem Absturz öffnet die andere Person die App: Die offene Fahrt gehört weiterhin dem ursprünglichen Profil und wird nie dem aktiven zugerechnet. (Task 8)
4. Trainer ist beim Start aus oder lässt sich nie verbinden: Die Fahrt kann trotzdem begonnen werden, die App sucht weiter und bleibt bedienbar. (Task 6)
5. Dieselbe Fahrt wird nach Serverausfall oder Abbruch mehrfach übertragen: Der Server hat am Ende jede Sekunde genau einmal. (Task 11)

---

## Dateistruktur

```text
src/shared/        Typen und Schemas (session.ts, sample.ts, protocol.ts, guardrails.ts)
src/service/       Fahrdienst: main.ts, recorder.ts, engine.ts, gears.ts, ws-server.ts, recovery.ts, sync.ts, live-log.ts
src/service/ble/   ftms-codec.ts, hr-codec.ts, device-port.ts, device-manager.ts, noble-adapter.ts, fake-device.ts
src/service/export/fit.ts
src/main/          Electron-Hauptprozess: index.ts (Supervisor, Fenster), film-window.ts
src/ui/            React-Oberfläche: Profil, Einheitswahl, Fahrt, Film-Modus
server/            Fastify-Server, Dockerfile, compose.yaml
scripts/           ble-probe.ts, live-adjust.ts, live-mark.ts
tests/             Unit-Tests je Modul, tests/chaos/ für Abnahmetests
docs/device-test.md  Ergebnisse von Stufe 0
```

## Stufe 0

### Task 1: Hub One und Polar-Gurt mit Auuki prüfen (manuell, Nutzer auf dem Rad)

**Files:**
- Create: `docs/device-test.md`

**Interfaces:**
- Produces: Protokoll, das Task 2 und Task 6 lesen.

- [ ] **Step 1: Repository anlegen und Design committen**

```bash
cd ~/Projects/bike-coach && git init -b main
git add docs && git commit -m "docs: add design and plan"
```

- [ ] **Step 2: Nutzer öffnet Auuki in Chrome auf dem Mac, verbindet Hub One und Polar-Gurt und fährt je 5 Minuten ERG und Steigung**

Vorher Zwift-Apps schließen, weil Geräte oft nur eine Verbindung annehmen.

- [ ] **Step 3: Ergebnis in `docs/device-test.md` eintragen**

Felder: Firmware Hub One, ob Zwift Cog oder Kassette montiert ist, Clicker-Modell (v1 oder v2), Reaktionszeit und Verhalten in ERG, Gefühl der Steigung. Bestanden, wenn Watt und Puls plausibel sind und ERG-Vorgaben umgesetzt werden. Falls nicht: stoppen und mit dem Nutzer klären.

### Task 2: Bluetooth-Prüfprogramm und Gänge am echten Gerät (Wegwerf)

**Files:**
- Create: `package.json`, `tsconfig.json`, `scripts/ble-probe.ts`
- Modify: `docs/device-test.md`

**Interfaces:**
- Produces: Entscheidung über Bluetooth-Bibliothek, Clicker-Status und Gang-Stufe, festgehalten in `docs/device-test.md`.

- [ ] **Step 1: Prüfprogramm schreiben**

`scripts/ble-probe.ts` läuft in einem Electron-`utilityProcess`, scannt mit `@stoprocent/noble` nach den Diensten `1826` (FTMS) und `180D` (Puls), abonniert `2AD2` und `2A37` und schreibt Werte zeilenweise aus. Tasten: `e` setzt 150 W per `2AD9`, `g`/`h` setzen die simulierte Steigung ±0,5 %. Außerdem listet es alle Dienste des Clickers und protokolliert alle Benachrichtigungen roh.

- [ ] **Step 2: 20 Minuten am echten Rad fahren**

Run: `npm run probe`
Expected: Mindestens 20 Minuten Watt und Puls ohne Abbruch, der Trainer reagiert auf ERG und Steigung. Scheitert die Bibliothek im `utilityProcess`, zuerst den Hauptprozess, dann eine andere Bibliothek testen und das Ergebnis notieren.

- [ ] **Step 3: Gänge und Clicker bewerten**

Der Nutzer fährt 10 Minuten mit ±0,5 %, ±1 % je „Gang“ und wählt die Stufe, die sich am ehesten nach Schalten anfühlt. Clicker: Nur wenn Tastendrücke unverschlüsselt oder mit vertretbarem Aufwand lesbar sind, wird ein `ClickerPort` in Task 6 umgesetzt, sonst bleibt es in Stufe 1 bei der Tastatur.

- [ ] **Step 4: Ergebnisse festhalten und committen**

`docs/device-test.md` enthält Bibliothek, Gang-Stufe (`GRADE_PER_GEAR`), Clicker-Entscheidung. Fühlen sich die Gänge schlecht an, gilt laut Design Steigung ohne Schalten.

```bash
git add docs package.json tsconfig.json scripts && git commit -m "test: record device probe results"
```

## Stufe 1

### Task 3: Projektgerüst und gemeinsame Datenformate

**Files:**
- Create: `electron.vite.config.ts`, `vitest.config.ts`, `src/shared/session.ts`, `src/shared/sample.ts`, `src/shared/guardrails.ts`
- Test: `tests/shared/session.test.ts`, `tests/shared/guardrails.test.ts`

**Interfaces:**
- Produces:
  - `Step = { durationS: number; label: string } & ({ kind: 'erg'; ftpFraction: number } | { kind: 'grade'; gradePct: number; scale: number })`
  - `Session = { id: string; name: string; steps: Step[] }`; `parseSession(input: unknown): Session`, wirft bei ungültigen Daten.
  - `Sample = { seq: number; wallClockMs: number; rideElapsedS: number; powerW: number | null; cadenceRpm: number | null; speedKph: number | null; hrBpm: number | null; targetW: number | null; gradePct: number | null; gear: number | null }`
  - `RideEvent = { wallClockMs: number; type: 'gap-start' | 'gap-end' | 'device-lost' | 'device-back' | 'marker' | 'target-adjust' | 'storage-error' | 'resumed'; detail?: string }`
  - `clampTargetW(requestedW: number, ftpW: number): number`, begrenzt auf 30 bis 150 % der FTP.

- [ ] **Step 1: Failing tests schreiben**

```ts
test('session accepts erg and grade steps', () => {
  expect(parseSession({ id: 'a', name: 'x', steps: [
    { kind: 'erg', durationS: 60, ftpFraction: 0.5, label: 'Warmup' },
    { kind: 'grade', durationS: 60, gradePct: 5, scale: 0.8, label: 'Anstieg' } ]}).steps).toHaveLength(2);
});
test('session rejects negative duration', () => {
  expect(() => parseSession({ id: 'a', name: 'x', steps: [{ kind: 'erg', durationS: -1, ftpFraction: 0.5, label: 'x' }] })).toThrow();
});
test('clamp keeps target within 30-150% FTP', () => {
  expect(clampTargetW(1000, 200)).toBe(300);
  expect(clampTargetW(10, 200)).toBe(60);
  expect(clampTargetW(150, 200)).toBe(150);
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npx vitest run tests/shared`
Expected: FAIL, Module fehlen.

- [ ] **Step 3: Gerüst und Module umsetzen**

Abhängigkeiten installieren, `zod` für `parseSession`. Die Grenzen liegen als benannte Konstanten in `guardrails.ts`.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/shared`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: add project scaffold and shared formats"
```

### Task 4: Absturzsichere Aufzeichnung

**Files:**
- Create: `src/service/recorder.ts`
- Test: `tests/service/recorder.test.ts`

**Interfaces:**
- Consumes: `Sample`, `RideEvent`.
- Produces:
  - `RideMeta = { rideId: string; profileId: string; sessionId: string; startedAtMs: number; status: 'open' | 'finished' | 'aborted' }`
  - `class RideRecorder { static create(dir, meta): RideRecorder; static open(dir, rideId): RideRecorder; append(sample: Sample): void; event(e: RideEvent): void; finish(status): void; hasStorageError(): boolean }`
  - `readRide(dir, rideId): { meta: RideMeta; samples: Sample[]; events: RideEvent[] }`
  - Ablage: `<dir>/<rideId>/meta.json`, `samples.jsonl`, `events.jsonl`.

- [ ] **Step 1: Failing tests schreiben**

```ts
test('every append is on disk immediately', () => { /* append; readRide in neuem Aufruf liefert das Sample */ });
test('truncated last line is ignored on read', () => { /* halbe Zeile anhängen; samples.length bleibt; kein Fehler */ });
test('open() continues seq after truncation', () => { /* nach Abschneiden: nächstes Sample hat seq letzter+1 und liest sauber */ });
test('meta write is atomic', () => { /* übrig gebliebene meta.json.tmp stört nicht */ });
test('write failure buffers and retries without throwing', () => {
  // Schreiber per injiziertem fs liefert ENOSPC, dann wieder OK
  // append wirft nicht, hasStorageError() === true, danach alle Samples in Reihenfolge auf der Platte
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npx vitest run tests/service/recorder.test.ts`
Expected: FAIL

- [ ] **Step 3: Recorder umsetzen**

Jede Zeile per `fs.writeSync` plus `fsyncSync` schreiben. `meta.json` über temporäre Datei und `rename`. Das `fs` wird injizierbar gemacht. `open()` kürzt eine abgeschnittene letzte Zeile, bevor weitergeschrieben wird. Fehlgeschlagene Zeilen kommen in einen Speicherpuffer, der vor jedem neuen Schreiben erneut versucht wird.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/service/recorder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/recorder.ts tests/service/recorder.test.ts && git commit -m "feat: add crash-safe ride recorder"
```

### Task 5: FTMS- und Puls-Codecs

**Files:**
- Create: `src/service/ble/ftms-codec.ts`, `src/service/ble/hr-codec.ts`
- Test: `tests/service/ble/codec.test.ts`

**Interfaces:**
- Produces:
  - `parseIndoorBikeData(b: Buffer): { speedKph?: number; cadenceRpm?: number; powerW?: number }` (Merkmal `2AD2`)
  - `encodeRequestControl(): Buffer` (`0x00`), `encodeStart(): Buffer` (`0x07`), `encodeTargetPower(w: number): Buffer` (`0x05`, sint16 LE), `encodeSimulation(gradePct: number): Buffer` (`0x11`, Wind 0, Steigung sint16 in 0,01 %, Crr 0,004 = `40`, Cw 0,51 = `51`)
  - `parseHeartRate(b: Buffer): number` (`2A37`, Flag-Bit 0: uint8 oder uint16)

- [ ] **Step 1: Failing tests schreiben**

```ts
test('parses speed, cadence and power by flags', () => {
  // flags 0x0044: Bit 2 Trittfrequenz, Bit 6 Leistung; Bit 0 = 0 heißt Tempo vorhanden
  const b = Buffer.from([0x44, 0x00, 0xE8, 0x03, 0xB4, 0x00, 0xC8, 0x00]);
  expect(parseIndoorBikeData(b)).toEqual({ speedKph: 10, cadenceRpm: 90, powerW: 200 });
});
test('skips optional fields before power', () => {
  // flags 0x0070: Tempo, Distanz (3 Bytes), Widerstand (2 Bytes), Leistung
  const b = Buffer.from([0x70, 0x00, 0xE8, 0x03, 1, 0, 0, 5, 0, 0x64, 0x00]);
  expect(parseIndoorBikeData(b).powerW).toBe(100);
});
test('encodes target power', () => expect([...encodeTargetPower(200)]).toEqual([0x05, 0xC8, 0x00]));
test('encodes negative grade', () => expect([...encodeSimulation(-2.5)]).toEqual([0x11, 0, 0, 0x06, 0xFF, 40, 51]));
test('parses uint8 and uint16 heart rate', () => {
  expect(parseHeartRate(Buffer.from([0x00, 150]))).toBe(150);
  expect(parseHeartRate(Buffer.from([0x01, 0x2C, 0x01]))).toBe(300);
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npx vitest run tests/service/ble/codec.test.ts`
Expected: FAIL

- [ ] **Step 3: Codecs umsetzen**

Der Parser geht alle Felder laut FTMS-Flags in Reihenfolge durch: Bit 0 invertiert (Tempo), 1 Durchschnittstempo, 2 Trittfrequenz, 3 Durchschnittstrittfrequenz, 4 Distanz, 5 Widerstand, 6 Leistung. Nicht benötigte Felder werden übersprungen.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/service/ble/codec.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/ble tests/service/ble && git commit -m "feat: add FTMS and heart rate codecs"
```

### Task 6: Geräteverwaltung mit Wiederverbinden

**Files:**
- Create: `src/service/ble/device-port.ts`, `src/service/ble/device-manager.ts`, `src/service/ble/noble-adapter.ts`, `src/service/ble/fake-device.ts`
- Test: `tests/service/ble/device-manager.test.ts`

**Interfaces:**
- Consumes: Codecs aus Task 5; Bibliothek und Clicker-Entscheidung aus `docs/device-test.md`.
- Produces:
  - `DeviceKind = 'trainer' | 'hr' | 'clicker'`
  - `interface BlePort { connect(kind: DeviceKind): Promise<void>; disconnect(kind): Promise<void>; subscribe(kind, cb: (b: Buffer) => void): void; write(kind, b: Buffer): Promise<void>; onDisconnect(cb: (kind) => void): void }`
  - `class DeviceManager { constructor(port: BlePort, opts?: { retryMs?: number }); start(): void; setTargetPower(w: number): void; setGrade(pct: number): void; onReading(cb: (r: Reading) => void): void; onStatus(cb: (s: Record<DeviceKind, 'connected'|'searching'>) => void): void; onClick(cb: (dir: 'up'|'down') => void): void }`
  - `Reading = { powerW?: number; cadenceRpm?: number; speedKph?: number; hrBpm?: number }`
  - `FakeBlePort` für alle späteren Tests.

- [ ] **Step 1: Failing tests schreiben**

```ts
test('start never rejects when trainer is off and keeps searching', async () => { /* connect schlägt 3-mal fehl, danach verbunden; status zuerst searching, dann connected */ });
test('reconnect re-requests control and resends last target', async () => { /* setTargetPower(200), Trennung, Rückkehr: Schreibfolge enthält RequestControl, Start, TargetPower(200) */ });
test('commands while disconnected are kept, latest wins', async () => { /* setTargetPower(100) und (200) offline: nach Verbindung nur 200 */ });
test('missing hr does not affect trainer readings', async () => { /* nur Trainer verbindet: Readings kommen */ });
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npx vitest run tests/service/ble/device-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: `DeviceManager`, `FakeBlePort` und `NobleBlePort` umsetzen**

Der Manager wiederholt die Verbindung je Gerät alle `retryMs` (Standard 2000), ohne Ausnahmen nach außen. Der `NobleBlePort` merkt sich pro Art die zuletzt gewählte Geräte-UUID. Die Geräte-Zuordnung ist pro Mac einmalig, weil macOS UUIDs statt Adressen liefert.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/service/ble/device-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/ble tests/service/ble && git commit -m "feat: add reconnecting device manager"
```

### Task 7: Fahr-Engine

**Files:**
- Create: `src/service/engine.ts`, `src/service/gears.ts`
- Test: `tests/service/engine.test.ts`

**Interfaces:**
- Consumes: `Session`, `Sample`, `RideEvent`, `clampTargetW`, `Reading`.
- Produces:
  - `effectiveGrade(gradePct: number, scale: number, gear: number, gradePerGear: number): number`; Gang 1 bis 12, neutral 6, Ergebnis auf −10 bis +20 % begrenzt.
  - `class RideEngine { constructor(opts: { session: Session; ftpW: number; gradePerGear: number; resumeAtS?: number; startSeq?: number; nowMs: () => number }); tick(latest: Reading): { sample: Sample; command: { targetW?: number; gradePct?: number } | null; events: RideEvent[] }; shift(dir: 'up'|'down'): void; adjustTarget(deltaPct: number): RideEvent; state(): EngineState; isDone(): boolean }`
  - `EngineState = { stepIndex: number; stepRemainingS: number; rideElapsedS: number; targetW: number | null; gradePct: number | null; gear: number | null; label: string; nextLabel: string | null; secondsToNext: number }`

- [ ] **Step 1: Failing tests schreiben**

```ts
test('erg step targets fraction of FTP', () => { /* ftp 200, 0.5 => command.targetW 100 */ });
test('moves to next step exactly on duration', () => { /* 2 Steps zu 60 s, 60 Ticks */ });
test('resume starts at given second with correct step and seq', () => { /* resumeAtS 90, startSeq 91 */ });
test('gap over 5s of wall clock emits gap events and does not advance ride time', () => {
  // nowMs springt um 300000 ms (Ruhezustand): rideElapsedS +1, Events gap-start und gap-end
});
test('adjustTarget is clamped and logged', () => { /* +500 % => 150 % FTP, Event target-adjust */ });
test('shift in erg step changes nothing', () => {});
test('grade step sends scaled grade plus gear offset', () => {
  // 5 % * 0.8 = 4; Gang 8 bei 0.5 je Gang => 5
});
test('null readings still produce a sample', () => { /* powerW null, Fahrt läuft */ });
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npx vitest run tests/service/engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Engine umsetzen**

Reine Logik ohne Timer und I/O. Sprünge der Uhr über 5 s gelten als Lücke. `adjustTarget` wirkt nur im aktuellen Abschnitt. `gradePerGear` kommt aus `docs/device-test.md`.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/service/engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/engine.ts src/service/gears.ts tests/service/engine.test.ts && git commit -m "feat: add ride engine"
```

### Task 8: Fahrdienst, Wiederaufnahme und Supervisor

**Files:**
- Create: `src/shared/protocol.ts`, `src/service/main.ts`, `src/service/ws-server.ts`, `src/service/recovery.ts`, `src/main/index.ts`
- Test: `tests/service/recovery.test.ts`, `tests/service/ride-service.test.ts`

**Interfaces:**
- Consumes: `RideRecorder`, `DeviceManager`, `RideEngine`.
- Produces:
  - WebSocket auf `127.0.0.1:7410`. Client an Dienst: `{type:'start', profileId, session, ftpW}`, `{type:'shift', dir}`, `{type:'adjust', deltaPct}`, `{type:'mark', note?}`, `{type:'stop'}`, `{type:'resume', rideId}`, `{type:'discard-resume', rideId}`. Dienst an Client: `{type:'state', ride, engine, devices, latest, storageError}` jede Sekunde sowie `{type:'recovery-offer', rideId, profileId, sessionName, rideElapsedS}`.
  - `findOpenRides(dir): RideMeta[]`, `resumePoint(ride): { resumeAtS: number; startSeq: number }`
  - `class RideService { constructor(deps: { dir: string; ble: BlePort; nowMs: () => number }); handle(msg): void; tick(): void }`. Der 1-Sekunden-Timer sitzt nur in `main.ts`.
  - Hauptprozess: `startService(): UtilityProcess`, startet bei Exit sofort neu; hält während einer Fahrt `powerSaveBlocker.start('prevent-app-suspension')` und bei beendeter Oberfläche den Dienst am Leben.

- [ ] **Step 1: Failing tests schreiben**

```ts
test('open ride yields resume point from last sample', () => {});
test('recovery keeps original profile regardless of active profile', () => {
  // Fahrt von Profil A offen; Client meldet aktives Profil B; recovery-offer.profileId === 'A'; resume schreibt in Fahrt A
});
test('discard-resume marks aborted and keeps samples', () => { /* Status aborted, samples erhalten */ });
test('ui disconnect does not affect ride', () => { /* WS trennen, ticks laufen, samples wachsen */ });
test('second start is refused while a ride is open', () => {});
test('ride can start with no devices connected', () => {});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npx vitest run tests/service`
Expected: FAIL

- [ ] **Step 3: Dienst und Supervisor umsetzen**

`RideService` verbindet die Bausteine; Reihenfolge je Tick: Engine, Aufzeichnung, dann Geräte-Befehl, dann Broadcast. Ein Fehler beim Broadcast oder Gerät darf das Aufzeichnen nicht verhindern. Nach Neustart mit offener Fahrt wird automatisch weitergezeichnet, bis der Nutzer entscheidet, und im Status als „wiederhergestellt“ angezeigt. Das Schließen des Fensters beendet den Dienst während einer Fahrt nicht.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src tests && git commit -m "feat: add ride service with recovery and supervisor"
```

### Task 9: Abnahmetests „Eine Fahrt geht nie verloren“

**Files:**
- Create: `tests/chaos/ride-chaos.test.ts`, `tests/chaos/helpers.ts`
- Modify: `package.json` (Skript `test:chaos`)

**Interfaces:**
- Consumes: `src/service/main.ts` mit Umgebungsvariablen `BIKE_FAKE_BLE=1`, `BIKE_DATA_DIR`, `BIKE_TIME_SCALE`.

- [ ] **Step 1: Failing tests schreiben**

Der Dienst läuft als echter Kindprozess mit `FakeBlePort` und beschleunigter Zeit.

```ts
test('SIGKILL at 80% loses at most 2 s and resumes in place', async () => {
  // Fahrt 100 s; bei 80 s kill -9; Neustart; recovery; zu Ende fahren
  // erwartet: seq lückenlos oder Lücke <= 2, letzter rideElapsedS 100, Status finished
});
test('trainer drop for 30 s keeps ride running and marks gap', async () => {});
test('server unreachable during whole ride changes nothing', async () => {});
test('UI client reconnects 20 times during ride without losing samples', async () => {});
test('kill during write leaves readable ride', async () => { /* 20-mal zufällig killen, readRide wirft nie */ });
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm run test:chaos`
Expected: FAIL, bis `BIKE_FAKE_BLE` und `BIKE_TIME_SCALE` umgesetzt sind.

- [ ] **Step 3: Testschalter in `main.ts` ergänzen und Fehler beheben**

Findet ein Test Datenverlust, wird die Ursache im Dienst behoben. Toleranzen werden nicht gelockert.

- [ ] **Step 4: Tests dreimal hintereinander laufen lassen**

Run: `npm run test:chaos && npm run test:chaos && npm run test:chaos`
Expected: dreimal PASS

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "test: add ride-loss acceptance tests"
```

### Task 10: Oberfläche und Film-Modus

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/useRide.ts`, `src/ui/views/ProfileView.tsx`, `src/ui/views/SessionView.tsx`, `src/ui/views/RideView.tsx`, `src/ui/views/FilmView.tsx`, `src/ui/views/RecoveryDialog.tsx`, `src/main/film-window.ts`, `src/shared/starter-sessions.ts`, `src/shared/profiles.ts`
- Test: `tests/ui/ride-view.test.tsx`

**Interfaces:**
- Consumes: Protokoll aus Task 8.
- Produces: `useRide(): { state; send(msg) }`, verbindet sich automatisch neu. `Profile = { id: string; name: string; ftpW: number }`, lokal in `<dataDir>/profiles.json`. `STARTER_SESSIONS: Session[]` mit drei Einheiten (locker 30 min, Intervalle 45 min, Steigung 40 min), je mit Warmup.

- [ ] **Step 1: Failing tests schreiben**

```tsx
test('shows target, power, heart rate and remaining time', () => {});
test('warns before a step change', () => { /* secondsToNext 10 => Hinweis mit nextLabel */ });
test('missing heart rate shows dash, not error', () => {});
test('storage error shows prominent warning', () => {});
test('recovery dialog names the original profile', () => {});
test('arrow keys send shift messages', () => {});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npx vitest run tests/ui`
Expected: FAIL

- [ ] **Step 3: Ansichten umsetzen**

Abfolge: Profil, Einheit, Fahrt. `FilmView` läuft in einem kleinen, immer obenliegenden Fenster (`alwaysOnTop`, Größe etwa 320×200) mit Vorgabe, Puls, Trittfrequenz, Restzeit und deutlichem Wechsel-Hinweis. Die Oberfläche hält keinen Fahrtzustand, sondern zeigt nur an, was der Dienst sendet.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/ui`
Expected: PASS

- [ ] **Step 5: Mit Fake-Geräten ansehen**

Run: `BIKE_FAKE_BLE=1 npm run dev`
Expected: Eine Einheit läuft durch; `Cmd+R` im Fenster während der Fahrt stört die Aufzeichnung nicht; der Film-Modus bleibt über einem Vollbild-fremden Fenster sichtbar.

- [ ] **Step 6: Commit**

```bash
git add src tests && git commit -m "feat: add ride UI and film mode"
```

### Task 11: Heimserver und Sync

**Files:**
- Create: `server/index.ts`, `server/db.ts`, `server/Dockerfile`, `server/compose.yaml`, `server/.env.example`, `server/backup.sh`, `src/service/sync.ts`
- Test: `tests/server/sync-api.test.ts`, `tests/service/sync.test.ts`

**Interfaces:**
- Consumes: `readRide`, `RideMeta`, `Sample`, `RideEvent`.
- Produces:
  - `PUT /rides/:rideId/meta`, `POST /rides/:rideId/samples` (Liste), `POST /rides/:rideId/events`, `GET /rides/:rideId/progress` → `{ lastSeq: number; eventCount: number }`, `GET /profiles/:id/rides`; alle mit `Authorization: Bearer <SYNC_TOKEN>`.
  - `class SyncClient { constructor(opts: { baseUrl: string; token: string; dir: string }); syncAll(): Promise<void> }`, läuft alle 30 s im eigenen Timer und überträgt ab `lastSeq`.

- [ ] **Step 1: Failing tests schreiben**

```ts
test('duplicate samples are stored once', async () => { /* gleiche Liste 2-mal senden: COUNT = n */ });
test('resumes from lastSeq after partial upload', async () => {});
test('rejects missing token', async () => { /* 401 */ });
test('server down leaves local ride untouched and does not throw', async () => {});
test('sync retried mid-upload converges to exactly once', async () => { /* Abbruch nach halber Liste, erneut syncAll */ });
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npx vitest run tests/server tests/service/sync.test.ts`
Expected: FAIL

- [ ] **Step 3: Server und Client umsetzen**

SQLite mit Primärschlüssel `(ride_id, seq)` und `INSERT OR IGNORE`, WAL-Modus. Lokale Daten werden nie nach dem Sync gelöscht. Sync läuft unabhängig von der Fahrt, ein Fehler landet nur im Log.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/server tests/service/sync.test.ts`
Expected: PASS

- [ ] **Step 5: Compose-Datei erstellen**

`name: bike-coach`, Dienst `api` auf `127.0.0.1:7002:7002`, `mem_limit: 256m`, Sidecar `tailscale/tailscale` mit Hostname `bike-coach`, `mem_limit: 128m`, ohne Funnel, beide `restart: unless-stopped`. `backup.sh` nutzt `sqlite3 .backup` nach `~/bike-coach/backups` und löscht nach 14 Tagen.

- [ ] **Step 6: Deployment mit dem Nutzer**

Vor dem Start `ss -tln` prüfen und die Belegungstabelle in `~/SERVER.md` ergänzen. Der Nutzer legt Tailscale-Key und Token in `~/bike-coach/.env` an. Cron-Zeile `30 6 * * * ~/bike-coach/backup.sh # bike-coach` ergänzen, nie ersetzen.

Run: `curl -H "Authorization: Bearer $SYNC_TOKEN" https://bike-coach.<tailnet>.ts.net/rides/test/progress`
Expected: `{"lastSeq":-1,"eventCount":0}`

- [ ] **Step 7: Commit**

```bash
git add server src tests && git commit -m "feat: add home server sync"
```

### Task 12: FIT-Export

**Files:**
- Create: `src/service/export/fit.ts`
- Modify: `src/service/ws-server.ts`, `src/ui/views/SessionView.tsx`
- Test: `tests/service/export.test.ts`

**Interfaces:**
- Consumes: `readRide`.
- Produces: `exportFit(ride: { meta; samples; events }): Buffer` und die Nachricht `{type:'export-fit', rideId}`, die die Datei nach `<dataDir>/exports/<rideId>.fit` schreibt.

- [ ] **Step 1: Failing tests schreiben**

```ts
test('round trip keeps record count, power and heart rate', () => {
  // mit @garmin/fitsdk Decoder lesen; recordMesgs.length === samples.length; power/heartRate gleich
});
test('null readings are omitted, not zero', () => {});
test('aborted ride exports too', () => {});
test('sport is cycling, sub sport indoor cycling', () => {});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npx vitest run tests/service/export.test.ts`
Expected: FAIL

- [ ] **Step 3: `exportFit` umsetzen**

Enthält `file_id`, `record` je Sample, `lap`, `session`, `activity`. Zeitstempel aus `wallClockMs`, damit Lücken als Pausen erkennbar bleiben.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/service/export.test.ts`
Expected: PASS

- [ ] **Step 5: Nutzer importiert eine Testdatei in Garmin Connect**

Expected: Import klappt, Watt und Puls erscheinen.

- [ ] **Step 6: Commit**

```bash
git add src tests && git commit -m "feat: add FIT export"
```

### Task 13: Live-Verbesserung auf dem Rad

**Files:**
- Create: `src/service/live-log.ts`, `scripts/live-adjust.ts`, `scripts/live-mark.ts`, `scripts/live-undo.ts`, `CLAUDE.md`
- Modify: `src/service/main.ts`, `src/ui/views/RideView.tsx`
- Test: `tests/service/live-log.test.ts`

**Interfaces:**
- Consumes: Protokoll aus Task 8.
- Produces: `<dataDir>/live/current.jsonl` mit einer Zeile je Sekunde und Ereignis; `npm run live:adjust -- <deltaPct>`, `npm run live:mark -- "<notiz>"`, `npm run live:undo`.

- [ ] **Step 1: Failing tests schreiben**

```ts
test('live log failure never affects recording', () => { /* Schreiber wirft; samples wachsen */ });
test('mark is stored in ride events', () => {});
test('undo reverts last live commit', () => { /* temporäres Repo, zwei Commits mit Präfix live:, undo erzeugt revert */ });
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npx vitest run tests/service/live-log.test.ts`
Expected: FAIL

- [ ] **Step 3: Log und Skripte umsetzen**

Taste `m` in der Fahrtansicht und ein Clicker-Langdruck (wenn verfügbar) setzen eine Markierung. Jede Live-Änderung wird als eigener Commit mit Präfix `live:` festgehalten; `live:undo` macht den letzten per `git revert` rückgängig.

- [ ] **Step 4: `CLAUDE.md` mit den Regeln schreiben**

Inhalt: Während einer offenen Fahrt sind `src/service/**` und `src/shared/**` tabu; erlaubt sind `src/ui/**`, Texte, `live:adjust` innerhalb der Leitplanken. Größeres kommt nach `docs/after-ride.md`. So liest Claude Code den Log, und so kommt das Sprachfeedback an: über macOS-Diktierfunktion im Terminal von Claude Code.

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run tests/service/live-log.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: add live improvement tools"
```

### Task 14: Erste echte Fahrten (Abnahme)

**Files:**
- Modify: `docs/device-test.md`, `docs/after-ride.md`

- [ ] **Step 1: Vor dem Aufsteigen alle Tests laufen lassen**

Run: `npx vitest run && npm run test:chaos`
Expected: alle PASS

- [ ] **Step 2: 20 Minuten mit echtem Gerät, einmal hart beenden**

Der Nutzer fährt eine Einheit; bei etwa 80 % wird `kill -9` auf den Dienst ausgeführt und Bluetooth am Mac kurz ausgeschaltet. Expected: Die App setzt fort, höchstens wenige Sekunden fehlen, Lücke ist markiert.

- [ ] **Step 3: Volle Einheit mit Live-Verbesserung fahren**

Der Nutzer gibt Feedback, Claude Code ändert nur Erlaubtes. Expected: Fahrt lückenlos, FIT-Export und Sync auf den Server stimmen.

- [ ] **Step 4: Zweite Person fährt mit eigenem Profil**

Expected: Fahrten sind dem richtigen Profil zugeordnet, Fahrt funktioniert auch ohne Gurt.

- [ ] **Step 5: Offene Punkte festhalten und committen**

```bash
git add docs && git commit -m "docs: record first real rides"
```

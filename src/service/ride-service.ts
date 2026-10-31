import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseProfile, type Profile } from '../shared/profiles';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import type { RideEvent } from '../shared/sample';
import { parseSession, type Session } from '../shared/session';
import { DeviceManager, type DeviceStatus, type Reading } from './ble/device-manager';
import type { BlePort } from './ble/device-port';
import { RideEngine } from './engine';
import { exportFit } from './export/fit';
import { readRide, RideRecorder } from './recorder';
import { findOpenRides, resumePoint } from './recovery';

/** Bis zum Gerätetest (Plan Task 2) vorläufiger Wert. */
export const DEFAULT_GRADE_PER_GEAR = 0.5;

type Active = {
  recorder: RideRecorder; engine: RideEngine; session: Session; ftpW: number; recovered: boolean;
  /** Wartet nach langem Stillstand auf die Entscheidung des Nutzers und zählt keine Zeit. */
  paused?: boolean;
  /** Fahrt ist zu Ende, aber noch nicht vollständig gespeichert. */
  ending?: 'finished' | 'aborted';
};
const STALE_READING_MS = 3000;
const CRASH_GAP_MS = 5000;
const LONG_DOWNTIME_MS = 5 * 60 * 1000;
const RIDE_ID = /^ride-[\w-]+$/;
const checkRideId = (id: string): void => { if (!RIDE_ID.test(id)) throw new Error('Ungültige Fahrt-ID.'); };
type Deps = { dir: string; ble: BlePort; nowMs: () => number; gradePerGear?: number; retryMs?: number; recorderFs?: typeof fs; onLive?: (line: object) => void; onRideChange?: (riding: boolean) => void; onRideStart?: () => void };

export class RideService {
  private devices: DeviceManager;
  private active: Active | null = null;
  private subs = new Set<(m: ServerMessage) => void>();
  private latest: Reading = {};
  private latestAt: Partial<Record<keyof Reading, number>> = {};
  private deviceStatus: DeviceStatus = { trainer: 'searching', hr: 'searching', clicker: 'searching' };

  constructor(private deps: Deps) {
    fs.mkdirSync(deps.dir, { recursive: true });
    this.devices = new DeviceManager(deps.ble, { retryMs: deps.retryMs });
    this.devices.onStatus((status) => this.onDeviceStatus(status));
    this.devices.onReading((r) => {
      this.latest = { ...this.latest, ...r };
      for (const key of Object.keys(r) as (keyof Reading)[]) this.latestAt[key] = this.deps.nowMs();
    });
    this.devices.onClick((dir) => this.active?.engine.shift(dir));
    this.devices.start();
    this.guard(() => this.recoverOpenRide());
  }

  subscribe(cb: (m: ServerMessage) => void): () => void {
    this.subs.add(cb);
    this.sendOffer(cb);
    return () => this.subs.delete(cb);
  }
  /** Das aktive Profil beeinflusst eine offene Fahrt nie; sie behält ihr ursprüngliches Profil. */
  subscribeActiveProfile(_profileId: string): void { this.broadcastOffer(); }

  handle(msg: ClientMessage): void {
    try {
      this.dispatch(msg);
    } catch (e) {
      this.broadcast({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  tick(): void {
    const a = this.active;
    if (!a || a.paused) { this.broadcastState(); return; }
    if (a.ending) { this.tryFinish(a); return; }
    const { sample, command, events } = a.engine.tick(this.freshReadings());
    for (const e of events) this.logEvent(e);
    a.recorder.append(sample);
    this.guard(() => this.deps.onLive?.(sample));
    if (a.engine.isDone()) { this.end('finished'); return; }
    this.guard(() => {
      if (command?.targetW !== undefined) this.devices.setTargetPower(command.targetW);
      if (command?.gradePct !== undefined) this.devices.setGrade(command.gradePct);
    });
    this.broadcastState();
  }

  isRiding(): boolean { return this.active !== null; }
  close(): void { this.devices.stop(); }

  private dispatch(msg: ClientMessage): void {
    const a = this.active;
    switch (msg.type) {
      case 'start': {
        if (a) throw new Error('Es läuft bereits eine Fahrt.');
        const session = parseSession(msg.session);
        const rideId = `ride-${this.deps.nowMs()}-${randomUUID().slice(0, 8)}`;
        const recorder = RideRecorder.create(this.deps.dir, {
          rideId, profileId: msg.profileId, sessionId: session.id, startedAtMs: this.deps.nowMs(), status: 'open',
        }, this.deps.recorderFs);
        const sessionFile = path.join(this.deps.dir, rideId, 'session.json');
        fs.writeFileSync(`${sessionFile}.tmp`, JSON.stringify({ session, ftpW: msg.ftpW, maxHrBpm: msg.maxHrBpm }));
        fs.renameSync(`${sessionFile}.tmp`, sessionFile);
        this.guard(() => this.deps.onRideStart?.());
        this.setActive({ recorder, engine: this.newEngine(session, msg.ftpW, { maxHrBpm: msg.maxHrBpm }), session, ftpW: msg.ftpW, recovered: false });
        return;
      }
      case 'shift': a?.engine.shift(msg.dir); return;
      case 'adjust': if (a) this.logEvent(a.engine.adjustTarget(msg.deltaPct)); return;
      case 'mark': this.logEvent({ wallClockMs: this.deps.nowMs(), type: 'marker', detail: msg.note }); return;
      case 'stop': if (a) this.end('aborted'); return;
      case 'resume': if (a) { a.recovered = false; a.paused = false; } return;
      case 'discard-resume': if (a && a.recorder.getMeta().rideId === msg.rideId) this.end('aborted'); return;
      case 'export-fit': checkRideId(msg.rideId); this.writeFit(msg.rideId); return;
      case 'save-profile': {
        const profile = parseProfile(msg.profile);
        const others = this.profiles().filter((x) => x.id !== profile.id);
        const file = path.join(this.deps.dir, 'profiles.json');
        fs.writeFileSync(`${file}.tmp`, JSON.stringify([...others, profile]));
        fs.renameSync(`${file}.tmp`, file);
        this.broadcastState();
        return;
      }
    }
  }

  /** Veraltete Werte dürfen nach einem Verbindungsverlust nicht weiter aufgezeichnet werden. */
  private onDeviceStatus(status: DeviceStatus): void {
    const prev = this.deviceStatus;
    this.deviceStatus = status;
    for (const kind of ['trainer', 'hr'] as const) {
      if (prev[kind] === status[kind]) continue;
      if (status[kind] === 'searching') {
        this.latest = kind === 'hr' ? { ...this.latest, hrBpm: undefined } : { hrBpm: this.latest.hrBpm };
      }
      this.logEvent({ wallClockMs: this.deps.nowMs(), type: status[kind] === 'searching' ? 'device-lost' : 'device-back', detail: kind });
    }
  }

  private logEvent(e: RideEvent): void {
    this.active?.recorder.event(e);
    this.guard(() => this.deps.onLive?.(e));
  }

  private writeFit(rideId: string): void {
    const out = path.join(this.deps.dir, 'exports');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${rideId}.fit`), exportFit(readRide(this.deps.dir, rideId)));
  }

  private profiles(): Profile[] {
    try { return JSON.parse(fs.readFileSync(path.join(this.deps.dir, 'profiles.json'), 'utf8')) as Profile[]; } catch { return []; }
  }

  private newEngine(session: Session, ftpW: number, extra: { resumeAtS?: number; startSeq?: number; maxHrBpm?: number } = {}): RideEngine {
    return new RideEngine({ session, ftpW, gradePerGear: this.deps.gradePerGear ?? DEFAULT_GRADE_PER_GEAR, nowMs: this.deps.nowMs, ...extra });
  }

  /** Eine offene Fahrt zeichnet nach dem Neustart sofort weiter; der Nutzer entscheidet danach. */
  private recoverOpenRide(): void {
    const open = findOpenRides(this.deps.dir);
    const [meta, ...others] = open.sort((x, y) => y.startedAtMs - x.startedAtMs);
    for (const old of others) this.guard(() => { RideRecorder.open(this.deps.dir, old.rideId).finish('aborted'); });
    if (!meta) return;
    const recorder = RideRecorder.open(this.deps.dir, meta.rideId, this.deps.recorderFs);
    let stored: { session: Session; ftpW: number; maxHrBpm?: number };
    try {
      stored = JSON.parse(fs.readFileSync(path.join(this.deps.dir, meta.rideId, 'session.json'), 'utf8')) as typeof stored;
    } catch {
      recorder.finish('aborted'); // Einheit unbekannt: Die Daten bleiben erhalten, weiterfahren geht nicht.
      return;
    }
    const ride = readRide(this.deps.dir, meta.rideId);
    const point = resumePoint(ride);
    const now = this.deps.nowMs();
    const lastMs = ride.samples.at(-1)?.wallClockMs ?? meta.startedAtMs;
    if (now - lastMs > CRASH_GAP_MS) {
      recorder.event({ wallClockMs: lastMs, type: 'gap-start' });
      recorder.event({ wallClockMs: now, type: 'gap-end' });
    }
    recorder.event({ wallClockMs: now, type: 'resumed', detail: `${point.resumeAtS}` });
    this.setActive({
      recorder, engine: this.newEngine(stored.session, stored.ftpW, { ...point, maxHrBpm: stored.maxHrBpm }), session: stored.session, ftpW: stored.ftpW,
      recovered: true, paused: now - lastMs > LONG_DOWNTIME_MS,
    });
  }

  private setActive(a: Active | null): void {
    this.active = a;
    this.guard(() => this.deps.onRideChange?.(a !== null));
  }

  private end(status: 'finished' | 'aborted'): void {
    const a = this.active;
    if (!a) return;
    a.ending ??= status;
    this.tryFinish(a);
  }

  private tryFinish(a: Active): void {
    if (a.recorder.finish(a.ending!)) {
      const { rideId } = a.recorder.getMeta();
      this.setActive(null);
      this.guard(() => this.writeFit(rideId));
    }
    this.broadcastState();
  }

  private freshReadings(): Reading {
    const now = this.deps.nowMs();
    const out: Reading = {};
    for (const key of Object.keys(this.latest) as (keyof Reading)[]) {
      if (now - (this.latestAt[key] ?? 0) <= STALE_READING_MS) out[key] = this.latest[key];
    }
    return out;
  }

  private sendOffer(cb: (m: ServerMessage) => void): void {
    const a = this.active;
    if (!a?.recovered) return;
    const meta = a.recorder.getMeta();
    this.guard(() => cb({
      type: 'recovery-offer', rideId: meta.rideId, profileId: meta.profileId,
      sessionName: a.session.name, rideElapsedS: a.engine.state().rideElapsedS,
    }));
  }
  private broadcastOffer(): void { for (const cb of this.subs) this.sendOffer(cb); }
  private broadcastState(): void {
    const a = this.active;
    this.broadcast({
      type: 'state', ride: a?.recorder.getMeta() ?? null, engine: a?.engine.state() ?? null,
      devices: this.devices.getStatus(), latest: this.freshReadings(),
      storageError: a?.recorder.hasStorageError() ?? false, recovered: a?.recovered ?? false, profiles: this.profiles(),
    });
  }
  private broadcast(m: ServerMessage): void { for (const cb of this.subs) this.guard(() => cb(m)); }
  private guard(fn: () => void): void {
    try { fn(); } catch { /* Oberfläche und Geräte dürfen die Aufzeichnung nie stören */ }
  }
}

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { parseSession, type Session } from '../shared/session';
import { DeviceManager, type DeviceStatus, type Reading } from './ble/device-manager';
import type { BlePort } from './ble/device-port';
import { RideEngine } from './engine';
import { readRide, RideRecorder } from './recorder';
import { findOpenRides, resumePoint } from './recovery';

/** Bis zum Gerätetest (Plan Task 2) vorläufiger Wert. */
export const DEFAULT_GRADE_PER_GEAR = 0.5;

type Active = { recorder: RideRecorder; engine: RideEngine; session: Session; ftpW: number; recovered: boolean };
type Deps = { dir: string; ble: BlePort; nowMs: () => number; gradePerGear?: number; retryMs?: number; onSample?: (line: object) => void; onRideChange?: (riding: boolean) => void };

export class RideService {
  private devices: DeviceManager;
  private active: Active | null = null;
  private subs = new Set<(m: ServerMessage) => void>();
  private latest: Reading = {};
  private deviceStatus: DeviceStatus = { trainer: 'searching', hr: 'searching', clicker: 'searching' };

  constructor(private deps: Deps) {
    fs.mkdirSync(deps.dir, { recursive: true });
    this.devices = new DeviceManager(deps.ble, { retryMs: deps.retryMs });
    this.devices.onStatus((status) => this.onDeviceStatus(status));
    this.devices.onReading((r) => { this.latest = { ...this.latest, ...r }; });
    this.devices.onClick((dir) => this.active?.engine.shift(dir));
    this.devices.start();
    this.recoverOpenRide();
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
    if (!a) { this.broadcastState(); return; }
    const { sample, command, events } = a.engine.tick(this.latest);
    for (const e of events) a.recorder.event(e);
    a.recorder.append(sample);
    this.guard(() => this.deps.onSample?.(sample));
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
        });
        fs.writeFileSync(path.join(this.deps.dir, rideId, 'session.json'), JSON.stringify({ session, ftpW: msg.ftpW }));
        this.setActive({ recorder, engine: this.newEngine(session, msg.ftpW), session, ftpW: msg.ftpW, recovered: false });
        return;
      }
      case 'shift': a?.engine.shift(msg.dir); return;
      case 'adjust': if (a) a.recorder.event(a.engine.adjustTarget(msg.deltaPct)); return;
      case 'mark': a?.recorder.event({ wallClockMs: this.deps.nowMs(), type: 'marker', detail: msg.note }); return;
      case 'stop': if (a) this.end('aborted'); return;
      case 'resume': if (a) { a.recovered = false; } return;
      case 'discard-resume': if (a && a.recorder.getMeta().rideId === msg.rideId) this.end('aborted'); return;
      case 'export-fit': return;
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
      this.active?.recorder.event({
        wallClockMs: this.deps.nowMs(), type: status[kind] === 'searching' ? 'device-lost' : 'device-back', detail: kind,
      });
    }
  }

  private newEngine(session: Session, ftpW: number, extra: { resumeAtS?: number; startSeq?: number } = {}): RideEngine {
    return new RideEngine({ session, ftpW, gradePerGear: this.deps.gradePerGear ?? DEFAULT_GRADE_PER_GEAR, nowMs: this.deps.nowMs, ...extra });
  }

  /** Eine offene Fahrt zeichnet nach dem Neustart sofort weiter; der Nutzer entscheidet danach. */
  private recoverOpenRide(): void {
    const open = findOpenRides(this.deps.dir);
    const [meta, ...others] = open.sort((x, y) => y.startedAtMs - x.startedAtMs);
    for (const old of others) RideRecorder.open(this.deps.dir, old.rideId).finish('aborted');
    if (!meta) return;
    const stored = path.join(this.deps.dir, meta.rideId, 'session.json');
    const recorder = RideRecorder.open(this.deps.dir, meta.rideId);
    if (!fs.existsSync(stored)) { recorder.finish('aborted'); return; }
    const { session, ftpW } = JSON.parse(fs.readFileSync(stored, 'utf8')) as { session: Session; ftpW: number };
    const point = resumePoint(readRide(this.deps.dir, meta.rideId));
    recorder.event({ wallClockMs: this.deps.nowMs(), type: 'resumed', detail: `${point.resumeAtS}` });
    this.setActive({ recorder, engine: this.newEngine(session, ftpW, point), session, ftpW, recovered: true });
  }

  private setActive(a: Active | null): void {
    this.active = a;
    this.guard(() => this.deps.onRideChange?.(a !== null));
  }

  private end(status: 'finished' | 'aborted'): void {
    this.active?.recorder.finish(status);
    this.setActive(null);
    this.broadcastState();
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
      devices: this.devices.getStatus(), latest: this.latest,
      storageError: a?.recorder.hasStorageError() ?? false, recovered: a?.recovered ?? false,
    });
  }
  private broadcast(m: ServerMessage): void { for (const cb of this.subs) this.guard(() => cb(m)); }
  private guard(fn: () => void): void {
    try { fn(); } catch { /* Oberfläche und Geräte dürfen die Aufzeichnung nie stören */ }
  }
}

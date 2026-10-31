import type { BlePort, DeviceKind } from './device-port';
import { encodeRequestControl, encodeSimulation, encodeStart, encodeTargetPower, parseIndoorBikeData } from './ftms-codec';
import { parseHeartRate } from './hr-codec';

export type Reading = { powerW?: number; cadenceRpm?: number; speedKph?: number; hrBpm?: number };
export type DeviceStatus = Record<DeviceKind, 'connected' | 'searching'>;
type TrainerCommand = { kind: 'power'; w: number } | { kind: 'grade'; pct: number };

const KINDS: DeviceKind[] = ['trainer', 'hr', 'clicker'];

export class DeviceManager {
  private status: DeviceStatus = { trainer: 'searching', hr: 'searching', clicker: 'searching' };
  private readingCb: (r: Reading) => void = () => {};
  private statusCb: (s: DeviceStatus) => void = () => {};
  private clickCb: (dir: 'up' | 'down') => void = () => {};
  private lastCommand: TrainerCommand | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  private retryMs: number;

  constructor(private port: BlePort, opts: { retryMs?: number } = {}) {
    this.retryMs = opts.retryMs ?? 2000;
    port.subscribe('trainer', (b) => this.safely(() => this.readingCb(parseIndoorBikeData(b))));
    port.subscribe('hr', (b) => this.safely(() => this.readingCb({ hrBpm: parseHeartRate(b) })));
    port.onDisconnect((kind) => {
      this.setStatus(kind, 'searching');
      this.schedule(kind);
    });
  }

  start(): void {
    this.statusCb({ ...this.status });
    for (const kind of KINDS) void this.tryConnect(kind);
  }
  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  setTargetPower(w: number): void { this.send({ kind: 'power', w }); }
  setGrade(pct: number): void { this.send({ kind: 'grade', pct }); }
  onReading(cb: (r: Reading) => void): void { this.readingCb = cb; }
  onStatus(cb: (s: DeviceStatus) => void): void { this.statusCb = cb; }
  onClick(cb: (dir: 'up' | 'down') => void): void { this.clickCb = cb; }
  getStatus(): DeviceStatus { return { ...this.status }; }

  private send(c: TrainerCommand): void {
    this.lastCommand = c;
    if (this.status.trainer === 'connected') this.writeTrainer(this.encode(c));
  }
  private encode(c: TrainerCommand): Buffer {
    return c.kind === 'power' ? encodeTargetPower(c.w) : encodeSimulation(c.pct);
  }
  private writeTrainer(b: Buffer): Promise<void> {
    return this.port.write('trainer', b).catch(() => { /* Neuverbindung sendet den letzten Befehl erneut */ });
  }
  private async tryConnect(kind: DeviceKind): Promise<void> {
    if (this.stopped) return;
    try {
      await this.port.connect(kind);
    } catch {
      this.schedule(kind);
      return;
    }
    this.setStatus(kind, 'connected');
    if (kind === 'trainer') {
      await this.writeTrainer(encodeRequestControl());
      await this.writeTrainer(encodeStart());
      if (this.lastCommand) await this.writeTrainer(this.encode(this.lastCommand));
    }
  }
  private schedule(kind: DeviceKind): void {
    if (this.stopped) return;
    const t = setTimeout(() => {
      this.timers.delete(t);
      void this.tryConnect(kind);
    }, this.retryMs);
    this.timers.add(t);
  }
  private setStatus(kind: DeviceKind, s: 'connected' | 'searching'): void {
    this.status[kind] = s;
    this.statusCb({ ...this.status });
  }
  private safely(fn: () => void): void {
    try { fn(); } catch { /* defektes Datenpaket beendet nie die Fahrt */ }
  }
}

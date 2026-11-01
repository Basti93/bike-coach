import type { BlePort, DeviceKind } from './device-port';
import { encodeRequestControl, encodeSimulation, encodeTargetPower, parseIndoorBikeData } from './ftms-codec';
import { parseClick } from './click-codec';
import { parseHeartRate } from './hr-codec';

export type Reading = { powerW?: number; cadenceRpm?: number; speedKph?: number; hrBpm?: number };
export type DeviceStatus = Record<DeviceKind, 'connected' | 'searching' | 'off'>;
type TrainerCommand = { kind: 'power'; w: number } | { kind: 'grade'; pct: number };

const KINDS: DeviceKind[] = ['trainer', 'hr', 'clicker'];
const CONTROL_RETRY_MS = 2000;
const RESULT_NOT_PERMITTED = 0x05;

export class DeviceManager {
  private status: DeviceStatus = { trainer: 'searching', hr: 'searching', clicker: 'searching' };
  private readingCb: (r: Reading) => void = () => {};
  private statusCb: (s: DeviceStatus) => void = () => {};
  private clickCb: (dir: 'up' | 'down') => void = () => {};
  private lastCommand: TrainerCommand | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  private connecting = new Set<DeviceKind>();
  private retryMs: number;
  private writeRetryMs: number;
  private pendingCommand: TrainerCommand | null = null;
  private pumping = false;
  private held = { plus: false, minus: false };
  private lastControlRequestMs = -Infinity;

  constructor(private port: BlePort, opts: { retryMs?: number; writeRetryMs?: number } = {}) {
    this.retryMs = opts.retryMs ?? 2000;
    this.writeRetryMs = opts.writeRetryMs ?? 500;
    port.subscribe('trainer', (b) => this.safely(() => this.readingCb(parseIndoorBikeData(b))));
    port.subscribe('hr', (b) => this.safely(() => this.readingCb({ hrBpm: parseHeartRate(b) })));
    port.subscribe('clicker', (b) => this.safely(() => this.handleClick(b)));
    port.onControl((b) => this.safely(() => this.handleControl(b)));
    port.onDisconnect((kind) => {
      if (kind === 'clicker') this.held = { plus: false, minus: false };
      if (this.status[kind] === 'off') return;
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

  /** Bleibt getrennt, bis jemand verbindet. So kann etwa der Clicker in den Ruhezustand gehen. */
  async disconnect(kind: DeviceKind): Promise<void> {
    if (kind === 'clicker') this.held = { plus: false, minus: false };
    this.setStatus(kind, 'off');
    await this.port.disconnect(kind).catch(() => { /* schon getrennt */ });
  }

  connect(kind: DeviceKind): void {
    if (this.status[kind] === 'connected') return;
    this.setStatus(kind, 'searching');
    void this.tryConnect(kind);
  }

  setTargetPower(w: number): void { this.send({ kind: 'power', w }); }
  setGrade(pct: number): void { this.send({ kind: 'grade', pct }); }
  onReading(cb: (r: Reading) => void): void { this.readingCb = cb; }
  onStatus(cb: (s: DeviceStatus) => void): void { this.statusCb = cb; }
  onClick(cb: (dir: 'up' | 'down') => void): void { this.clickCb = cb; }
  getStatus(): DeviceStatus { return { ...this.status }; }
  getNames(): Partial<Record<DeviceKind, string>> {
    const names: Partial<Record<DeviceKind, string>> = {};
    for (const kind of KINDS) {
      const name = this.status[kind] === 'connected' ? this.port.deviceName?.(kind) : null;
      if (name) names[kind] = name;
    }
    return names;
  }

  private send(c: TrainerCommand): void {
    this.lastCommand = c;
    this.pendingCommand = c;
    void this.pump();
  }

  /**
   * Immer nur ein Schreibvorgang, der neueste Befehl gewinnt, und ein fehlgeschlagener
   * wird wiederholt. Befehle gehen nur bei Änderungen raus, ein verlorener bliebe sonst
   * bis zum nächsten Abschnitt ohne Wirkung. Das Verhalten folgt dem bewährten Auuki.
   */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.pendingCommand && this.status.trainer === 'connected' && !this.stopped) {
        const c = this.pendingCommand;
        try {
          await this.port.write('trainer', this.encode(c));
          if (this.pendingCommand === c) this.pendingCommand = null;
        } catch {
          await this.wait(this.writeRetryMs);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Der Click wiederholt Meldungen, solange eine Taste gedrückt ist. Nur das Drücken zählt. */
  private handleClick(b: Buffer): void {
    const now = parseClick(b);
    if (!now) return;
    const before = this.held;
    this.held = now;
    if (now.plus && !before.plus) this.clickCb('up');
    if (now.minus && !before.minus) this.clickCb('down');
  }

  /** Hat der Trainer uns die Kontrolle entzogen, wirkte die Vorgabe sonst bis zum nächsten Abschnitt nicht. */
  private handleControl(b: Buffer): void {
    const lost = b[0] === 0xff || (b[0] === 0x80 && b[2] === RESULT_NOT_PERMITTED);
    const now = Date.now();
    if (!lost || now - this.lastControlRequestMs < CONTROL_RETRY_MS) return;
    this.lastControlRequestMs = now;
    void this.writeTrainer(encodeRequestControl()).then(() => {
      this.pendingCommand = this.lastCommand;
      return this.pump();
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.timers.delete(t); resolve(); }, ms);
      this.timers.add(t);
    });
  }
  private encode(c: TrainerCommand): Buffer {
    return c.kind === 'power' ? encodeTargetPower(c.w) : encodeSimulation(c.pct);
  }
  private writeTrainer(b: Buffer): Promise<void> {
    return this.port.write('trainer', b).catch(() => { /* Neuverbindung sendet den letzten Befehl erneut */ });
  }
  private async tryConnect(kind: DeviceKind): Promise<void> {
    if (this.stopped || this.connecting.has(kind) || this.status[kind] !== 'searching') return;
    this.connecting.add(kind);
    try {
      await this.port.connect(kind);
    } catch {
      this.connecting.delete(kind);
      if (this.status[kind] === 'searching') this.schedule(kind);
      return;
    }
    this.connecting.delete(kind);
    // Während des Wartens kann jemand getrennt haben.
    if (this.getStatus()[kind] === 'off') {
      await this.port.disconnect(kind).catch(() => { /* schon getrennt */ });
      return;
    }
    this.setStatus(kind, 'connected');
    if (kind === 'trainer') {
      await this.writeTrainer(encodeRequestControl());
      this.pendingCommand = this.lastCommand;
      await this.pump();
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
  private setStatus(kind: DeviceKind, s: DeviceStatus[DeviceKind]): void {
    this.status[kind] = s;
    this.statusCb({ ...this.status });
  }
  private safely(fn: () => void): void {
    try { fn(); } catch { /* defektes Datenpaket beendet nie die Fahrt */ }
  }
}

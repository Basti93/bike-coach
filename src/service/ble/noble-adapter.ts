import fs from 'node:fs';
import path from 'node:path';
import type { BlePort, DeviceKind } from './device-port';

const SERVICES: Partial<Record<DeviceKind, { service: string; notify: string; write?: string; status?: string }>> = {
  trainer: { service: '1826', notify: '2ad2', write: '2ad9', status: '2ada' },
  hr: { service: '180d', notify: '2a37' },
};
const SCAN_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 15_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Echte Bluetooth-Anbindung. Merkt sich pro Geräteart die zuletzt genutzte Geräte-UUID,
 * weil macOS UUIDs statt Adressen liefert. Noch nicht am echten Gerät geprüft (Plan Task 2).
 */
export class NobleBlePort implements BlePort {
  private subs = new Map<DeviceKind, (b: Buffer) => void>();
  private peripherals = new Map<DeviceKind, any>();
  private writers = new Map<DeviceKind, any>();
  private disconnectCb: (kind: DeviceKind) => void = () => {};
  private controlCb: (b: Buffer) => void = () => {};
  private connectTimeoutMs: number;
  private known: Partial<Record<DeviceKind, string>> = {};
  private knownFile: string;
  private noble: any;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string, nobleImpl?: unknown, opts: { connectTimeoutMs?: number } = {}) {
    this.connectTimeoutMs = opts.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    this.noble = nobleImpl;
    this.knownFile = path.join(dataDir, 'devices.json');
    try { this.known = JSON.parse(fs.readFileSync(this.knownFile, 'utf8')); } catch { /* erster Start */ }
  }

  /** Nacheinander, weil ein neuer Scan den laufenden ersetzt und sich die Geräte sonst gegenseitig aushungern. */
  connect(kind: DeviceKind): Promise<void> {
    const run = this.queue.then(() => this.connectNow(kind));
    this.queue = run.catch(() => {});
    return run;
  }

  private async connectNow(kind: DeviceKind): Promise<void> {
    const spec = SERVICES[kind];
    if (!spec) throw new Error(`${kind} wird in Stufe 1 nicht verbunden`);
    this.noble ??= ((await import('@stoprocent/noble')) as any).default;
    await this.noble.waitForPoweredOnAsync(SCAN_TIMEOUT_MS);
    const peripheral = await this.find(kind, spec.service);
    let ready = false;
    let dropped = false;
    peripheral.once('disconnect', () => {
      dropped = true;
      if (!ready) return;
      this.peripherals.delete(kind);
      this.writers.delete(kind);
      this.disconnectCb(kind);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.setUp(kind, spec, peripheral),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${kind}: Zeitüberschreitung beim Verbinden`)), this.connectTimeoutMs); }),
      ]);
      if (dropped) throw new Error(`${kind} während der Verbindung verloren`);
    } catch (e) {
      // Immer trennen: Eine halbe Verbindung blockiert sonst das Gerät für den nächsten Versuch.
      this.writers.delete(kind);
      await Promise.resolve(peripheral.disconnectAsync?.()).catch(() => {});
      throw e;
    } finally {
      clearTimeout(timer);
    }
    ready = true;
    this.peripherals.set(kind, peripheral);
    this.known[kind] = peripheral.id;
    fs.writeFileSync(this.knownFile, JSON.stringify(this.known));
  }

  private async setUp(kind: DeviceKind, spec: { service: string; notify: string; write?: string; status?: string }, peripheral: any): Promise<void> {
    await peripheral.connectAsync();
    const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [spec.service], [spec.notify, ...(spec.write ? [spec.write] : []), ...(spec.status ? [spec.status] : [])],
    );
    const notify = characteristics.find((c: any) => c.uuid === spec.notify);
    notify.on('data', (b: Buffer) => this.subs.get(kind)?.(b));
    await notify.subscribeAsync();
    if (spec.write) {
      const writer = characteristics.find((c: any) => c.uuid === spec.write);
      writer.on('data', (b: Buffer) => this.controlCb(b));
      await writer.subscribeAsync().catch(() => {});
      this.writers.set(kind, writer);
    }
    const status = spec.status && characteristics.find((c: any) => c.uuid === spec.status);
    if (status) {
      status.on('data', (b: Buffer) => this.controlCb(b));
      await status.subscribeAsync().catch(() => {});
    }
  }

  async disconnect(kind: DeviceKind): Promise<void> { await this.peripherals.get(kind)?.disconnectAsync(); }
  subscribe(kind: DeviceKind, cb: (b: Buffer) => void): void { this.subs.set(kind, cb); }
  onDisconnect(cb: (kind: DeviceKind) => void): void { this.disconnectCb = cb; }
  onControl(cb: (b: Buffer) => void): void { this.controlCb = cb; }

  async write(kind: DeviceKind, b: Buffer): Promise<void> {
    const writer = this.writers.get(kind);
    if (!writer) throw new Error('not connected');
    await writer.writeAsync(b, false);
  }

  private async find(kind: DeviceKind, service: string): Promise<any> {
    await this.noble.startScanningAsync([service], false);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.noble.removeListener('discover', onDiscover);
          reject(new Error(`${kind} nicht gefunden`));
        }, SCAN_TIMEOUT_MS);
        const onDiscover = (p: any) => {
          if (this.known[kind] && p.id !== this.known[kind]) return;
          clearTimeout(timer);
          this.noble.removeListener('discover', onDiscover);
          resolve(p);
        };
        this.noble.on('discover', onDiscover);
      });
    } finally {
      await this.noble.stopScanningAsync();
    }
  }
}

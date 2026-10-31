import fs from 'node:fs';
import path from 'node:path';
import type { BlePort, DeviceKind } from './device-port';

const SERVICES: Partial<Record<DeviceKind, { service: string; notify: string; write?: string }>> = {
  trainer: { service: '1826', notify: '2ad2', write: '2ad9' },
  hr: { service: '180d', notify: '2a37' },
};
const SCAN_TIMEOUT_MS = 10_000;

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
  private known: Partial<Record<DeviceKind, string>> = {};
  private knownFile: string;
  private noble: any;

  constructor(dataDir: string) {
    this.knownFile = path.join(dataDir, 'devices.json');
    try { this.known = JSON.parse(fs.readFileSync(this.knownFile, 'utf8')); } catch { /* erster Start */ }
  }

  async connect(kind: DeviceKind): Promise<void> {
    const spec = SERVICES[kind];
    if (!spec) throw new Error(`${kind} wird in Stufe 1 nicht verbunden`);
    this.noble ??= ((await import('@stoprocent/noble')) as any).default;
    await this.noble.waitForPoweredOnAsync(SCAN_TIMEOUT_MS);
    const peripheral = await this.find(kind, spec.service);
    await peripheral.connectAsync();
    const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [spec.service], [spec.notify, ...(spec.write ? [spec.write] : [])],
    );
    const notify = characteristics.find((c: any) => c.uuid === spec.notify);
    notify.on('data', (b: Buffer) => this.subs.get(kind)?.(b));
    await notify.subscribeAsync();
    if (spec.write) {
      const writer = characteristics.find((c: any) => c.uuid === spec.write);
      await writer.subscribeAsync().catch(() => {});
      this.writers.set(kind, writer);
    }
    peripheral.once('disconnect', () => {
      this.peripherals.delete(kind);
      this.writers.delete(kind);
      this.disconnectCb(kind);
    });
    this.peripherals.set(kind, peripheral);
    this.known[kind] = peripheral.id;
    fs.writeFileSync(this.knownFile, JSON.stringify(this.known));
  }

  async disconnect(kind: DeviceKind): Promise<void> { await this.peripherals.get(kind)?.disconnectAsync(); }
  subscribe(kind: DeviceKind, cb: (b: Buffer) => void): void { this.subs.set(kind, cb); }
  onDisconnect(cb: (kind: DeviceKind) => void): void { this.disconnectCb = cb; }

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

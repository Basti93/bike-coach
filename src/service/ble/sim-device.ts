import type { BlePort, DeviceKind } from './device-port';

const RIDER_KG = 75;
const G = 9.81;
const SPEED_MPS = 6;
const REST_HR = 60;
const POWER_LAG = 0.2;
const HR_LAG = 0.02;
const HR_PER_WATT = 0.45;

/** Simuliert Trainer und Gurt im echten Datenformat, damit die App ohne Rad durchfahrbar ist. */
export class SimBlePort implements BlePort {
  private subs = new Map<DeviceKind, (b: Buffer) => void>();
  private connected = new Set<DeviceKind>();
  private targetW = 120;
  private powerW = 0;
  private hr = REST_HR;

  async connect(kind: DeviceKind): Promise<void> {
    if (kind === 'clicker') throw new Error('kein simulierter Clicker');
    this.connected.add(kind);
  }
  async disconnect(kind: DeviceKind): Promise<void> { this.connected.delete(kind); }
  subscribe(kind: DeviceKind, cb: (b: Buffer) => void): void { this.subs.set(kind, cb); }
  onControl(): void { /* Der Simulator entzieht die Kontrolle nie. */ }
  onDisconnect(): void {}

  async write(_kind: DeviceKind, b: Buffer): Promise<void> {
    if (b[0] === 0x05) this.targetW = b.readInt16LE(1);
    if (b[0] === 0x11) {
      const grade = b.readInt16LE(3) / 100;
      this.targetW = Math.max(40, 90 + (grade / 100) * RIDER_KG * G * SPEED_MPS);
    }
  }

  step(dtS: number): void {
    this.powerW += (this.targetW - this.powerW) * Math.min(1, POWER_LAG * dtS);
    const hrGoal = REST_HR + this.powerW * HR_PER_WATT;
    this.hr += (hrGoal - this.hr) * Math.min(1, HR_LAG * dtS);
    const bike = Buffer.alloc(8);
    bike.writeUInt16LE(0x0044, 0); // Tempo, Trittfrequenz, Leistung
    bike.writeUInt16LE(Math.round((10 + Math.cbrt(this.powerW) * 4) * 100), 2);
    bike.writeUInt16LE(Math.round(88 * 2), 4);
    bike.writeInt16LE(Math.round(this.powerW), 6);
    if (this.connected.has('trainer')) this.subs.get('trainer')?.(bike);
    if (this.connected.has('hr')) this.subs.get('hr')?.(Buffer.from([0x00, Math.round(this.hr)]));
  }
}

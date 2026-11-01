export type DeviceKind = 'trainer' | 'hr' | 'clicker';
export interface BlePort {
  connect(kind: DeviceKind): Promise<void>;
  disconnect(kind: DeviceKind): Promise<void>;
  subscribe(kind: DeviceKind, cb: (b: Buffer) => void): void;
  write(kind: DeviceKind, b: Buffer): Promise<void>;
  onDisconnect(cb: (kind: DeviceKind) => void): void;
  /** Antworten des FTMS Control Point und Machine Status des Trainers. */
  onControl(cb: (b: Buffer) => void): void;
  /** Der Name, mit dem sich das verbundene Gerät meldet, falls bekannt. */
  deviceName?(kind: DeviceKind): string | null;
}

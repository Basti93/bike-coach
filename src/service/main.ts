import { FakeBlePort } from './ble/fake-device';
import { NobleBlePort } from './ble/noble-adapter';
import type { BlePort, DeviceKind } from './ble/device-port';
import fs from 'node:fs';
import path from 'node:path';
import { RideService } from './ride-service';
import { SyncClient } from './sync';
import { startWsServer } from './ws-server';

const dir = process.env.BIKE_DATA_DIR;
if (!dir) throw new Error('BIKE_DATA_DIR fehlt');
const scale = Number(process.env.BIKE_TIME_SCALE ?? 1);
const started = Date.now();
const nowMs = () => started + (Date.now() - started) * scale;
const fake = process.env.BIKE_FAKE_BLE === '1' ? new FakeBlePort() : null;
const ble: BlePort = fake ?? new NobleBlePort(dir);

const parent = (process as unknown as { parentPort?: { postMessage(m: unknown): void } }).parentPort;
const service = new RideService({
  dir, ble, nowMs,
  retryMs: fake ? 20 : undefined,
  onRideChange: (riding) => parent?.postMessage({ riding }),
});
const wss = startWsServer(service, Number(process.env.BIKE_PORT ?? 7410));
setInterval(() => service.tick(), 1000 / scale);

/** Sync ist optional: Ohne Einstellungen fährt man rein lokal. Er läuft getrennt vom Fahrtakt. */
const syncConfig = (): { syncUrl?: string; syncToken?: string } => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, '..', 'config.json'), 'utf8')); } catch { return {}; }
};
const syncUrl = process.env.BIKE_SYNC_URL ?? syncConfig().syncUrl;
const syncToken = process.env.BIKE_SYNC_TOKEN ?? syncConfig().syncToken;
if (syncUrl && syncToken) {
  const sync = new SyncClient({ baseUrl: syncUrl, token: syncToken, dir });
  setInterval(() => void sync.syncAll(), 30_000 / scale);
}

if (fake) {
  setInterval(() => {
    fake.emit('trainer', Buffer.from([0x41, 0x00, 0xC8, 0x00]));
    fake.emit('hr', Buffer.from([0x00, 140]));
  }, 200 / scale);
  // Nur für Tests: "drop trainer" und "back trainer" über stdin.
  process.stdin.on('data', (raw) => {
    const [cmd, kind] = String(raw).trim().split(' ');
    if (cmd === 'drop') fake.drop(kind as DeviceKind);
    if (cmd === 'back') fake.online[kind as DeviceKind] = true;
  });
}
wss.once('listening', () => process.stdout.write('ready\n'));

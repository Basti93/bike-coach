import { FakeBlePort } from './ble/fake-device';
import { NobleBlePort } from './ble/noble-adapter';
import type { BlePort, DeviceKind } from './ble/device-port';
import { RideService } from './ride-service';
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
startWsServer(service, Number(process.env.BIKE_PORT ?? 7410));
setInterval(() => service.tick(), 1000 / scale);

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
process.stdout.write('ready\n');

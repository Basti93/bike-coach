import { vi } from 'vitest';
import { DeviceManager } from '../../../src/service/ble/device-manager';
import { FakeBlePort } from '../../../src/service/ble/fake-device';

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('start never rejects when trainer is off and keeps searching', async () => {
  const port = new FakeBlePort();
  port.online.trainer = false;
  const m = new DeviceManager(port, { retryMs: 100 });
  const statuses: string[] = [];
  m.onStatus((s) => statuses.push(s.trainer));
  m.start();
  await vi.advanceTimersByTimeAsync(350);
  port.online.trainer = true;
  await vi.advanceTimersByTimeAsync(150);
  expect(statuses[0]).toBe('searching');
  expect(statuses.at(-1)).toBe('connected');
  m.stop();
});
test('reconnect re-requests control and resends last target', async () => {
  const port = new FakeBlePort();
  const m = new DeviceManager(port, { retryMs: 100 });
  m.start();
  await settle();
  m.setTargetPower(200);
  await settle();
  port.drop('trainer');
  port.writes = [];
  port.online.trainer = true;
  await vi.advanceTimersByTimeAsync(150);
  expect(port.writes.map((w) => w.bytes[0])).toEqual([0x00, 0x07, 0x05]);
  expect(port.writes[2].bytes).toEqual([0x05, 0xC8, 0x00]);
  m.stop();
});
test('commands while disconnected are kept, latest wins', async () => {
  const port = new FakeBlePort();
  port.online.trainer = false;
  const m = new DeviceManager(port, { retryMs: 100 });
  m.start();
  await settle();
  m.setTargetPower(100);
  m.setTargetPower(200);
  port.online.trainer = true;
  await vi.advanceTimersByTimeAsync(150);
  const powers = port.writes.filter((w) => w.bytes[0] === 0x05);
  expect(powers.map((w) => w.bytes[1])).toEqual([0xC8]);
  m.stop();
});
test('missing hr does not affect trainer readings', async () => {
  const port = new FakeBlePort();
  port.online.hr = false;
  const m = new DeviceManager(port, { retryMs: 100 });
  const seen: number[] = [];
  m.onReading((r) => { if (r.powerW !== undefined) seen.push(r.powerW); });
  m.start();
  await settle();
  port.emit('trainer', Buffer.from([0x41, 0x00, 0x64, 0x00]));
  expect(seen).toEqual([100]);
  m.stop();
});
test('write failure on trainer does not throw', async () => {
  const port = new FakeBlePort();
  const m = new DeviceManager(port, { retryMs: 100 });
  port.write = async () => { throw new Error('gatt'); };
  m.start();
  await settle();
  expect(() => m.setTargetPower(100)).not.toThrow();
  await settle();
  m.stop();
});

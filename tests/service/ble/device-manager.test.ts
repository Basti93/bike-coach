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
  expect(port.writes.map((w) => w.bytes[0])).toEqual([0x00, 0x05]);
  expect(port.writes[1].bytes).toEqual([0x05, 0xC8, 0x00]);
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
test('failed trainer write is retried until it succeeds', async () => {
  const port = new FakeBlePort();
  const m = new DeviceManager(port, { retryMs: 100, writeRetryMs: 50 });
  m.start();
  await settle();
  const real = port.write.bind(port); let fails = 2;
  port.write = async (k, b) => { if (b[0] === 0x05 && fails-- > 0) throw new Error('gatt'); return real(k, b); };
  m.setTargetPower(200);
  await vi.advanceTimersByTimeAsync(200);
  expect(port.writes.filter((w) => w.bytes[0] === 0x05).map((w) => w.bytes[1])).toEqual([0xC8]);
  m.stop();
});
test('a newer target replaces one still being retried', async () => {
  const port = new FakeBlePort();
  const m = new DeviceManager(port, { retryMs: 100, writeRetryMs: 50 });
  m.start();
  await settle();
  const real = port.write.bind(port); let block = true;
  port.write = async (k, b) => { if (block) throw new Error('gatt'); return real(k, b); };
  m.setTargetPower(100);
  await vi.advanceTimersByTimeAsync(20);
  m.setTargetPower(200);
  block = false;
  await vi.advanceTimersByTimeAsync(200);
  expect(port.writes.filter((w) => w.bytes[0] === 0x05).map((w) => w.bytes[1])).toEqual([0xC8]);
  m.stop();
});
test('trainer writes never overlap', async () => {
  const port = new FakeBlePort();
  const m = new DeviceManager(port, { retryMs: 100 });
  m.start();
  await settle();
  const real = port.write.bind(port); let inFlight = 0; let max = 0;
  port.write = async (k, b) => { inFlight++; max = Math.max(max, inFlight); await new Promise((r) => setTimeout(r, 10)); inFlight--; return real(k, b); };
  m.setTargetPower(100); m.setGrade(3); m.setTargetPower(200);
  await vi.advanceTimersByTimeAsync(100);
  expect(max).toBe(1);
  expect(port.writes.at(-1)!.bytes).toEqual([0x05, 0xC8, 0x00]);
  m.stop();
});

describe('Trainer entzieht die Kontrolle', () => {
  const reqControl = [0x00];
  const start = async () => {
    const port = new FakeBlePort();
    const m = new DeviceManager(port, { retryMs: 100 });
    m.start();
    await vi.advanceTimersByTimeAsync(10);
    m.setTargetPower(200);
    await settle();
    port.writes.length = 0;
    return { port, m };
  };
  test('control not permitted requests control and resends the target', async () => {
    const { port, m } = await start();
    port.emitControl(Buffer.from([0x80, 0x05, 0x05]));
    await settle();
    expect(port.writes.map((w) => w.bytes[0])).toEqual([reqControl[0], 0x05]);
    m.stop();
  });
  test('machine status control lost does the same', async () => {
    const { port, m } = await start();
    port.emitControl(Buffer.from([0xff]));
    await settle();
    expect(port.writes[0].bytes).toEqual(reqControl);
    m.stop();
  });
  test('success responses change nothing and repeats are limited', async () => {
    const { port, m } = await start();
    port.emitControl(Buffer.from([0x80, 0x05, 0x01]));
    await settle();
    expect(port.writes).toEqual([]);
    port.emitControl(Buffer.from([0xff])); port.emitControl(Buffer.from([0xff]));
    await settle();
    expect(port.writes.filter((w) => w.bytes[0] === 0x00)).toHaveLength(1);
    m.stop();
  });

});

describe('Zwift Click', () => {
  const PLUS = Buffer.from([0x37, 0x08, 0x00, 0x10, 0x01]);
  const MINUS = Buffer.from([0x37, 0x08, 0x01, 0x10, 0x00]);
  const IDLE = Buffer.from([0x37, 0x08, 0x01, 0x10, 0x01]);
  const start = async () => {
    const port = new FakeBlePort(); port.online.clicker = true;
    const m = new DeviceManager(port, { retryMs: 100 });
    const clicks: string[] = [];
    m.onClick((d) => clicks.push(d));
    m.start();
    await vi.advanceTimersByTimeAsync(10);
    return { port, m, clicks };
  };
  test('plus shifts up, minus shifts down', async () => {
    const { port, m, clicks } = await start();
    port.emit('clicker', PLUS); port.emit('clicker', IDLE); port.emit('clicker', MINUS);
    expect(clicks).toEqual(['up', 'down']);
    m.stop();
  });
  test('repeated frames of a held button count once', async () => {
    const { port, m, clicks } = await start();
    port.emit('clicker', PLUS); port.emit('clicker', PLUS); port.emit('clicker', PLUS);
    expect(clicks).toEqual(['up']);
    m.stop();
  });
  test('a dropped clicker does not swallow the next press', async () => {
    const { port, m, clicks } = await start();
    port.emit('clicker', PLUS);
    port.drop('clicker'); port.online.clicker = true;
    await vi.advanceTimersByTimeAsync(150);
    port.emit('clicker', PLUS);
    expect(clicks).toEqual(['up', 'up']);
    m.stop();
  });
  test('garbage from the clicker changes nothing', async () => {
    const { port, m, clicks } = await start();
    port.emit('clicker', Buffer.from([0x37, 0xff])); port.emit('clicker', Buffer.from('RideOn'));
    expect(clicks).toEqual([]);
    m.stop();
  });
});

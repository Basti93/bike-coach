import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NobleBlePort } from '../../../src/service/ble/noble-adapter';

const peripheral = (service: string) => {
  const p: any = new EventEmitter();
  p.id = service; p.advertisement = { serviceUuids: [service] };
  p.connectAsync = async () => {};
  p.discoverSomeServicesAndCharacteristicsAsync = async () => ({ characteristics: [
    Object.assign(new EventEmitter(), { uuid: service === '1826' ? '2ad2' : '2a37', subscribeAsync: async () => {} }),
    Object.assign(new EventEmitter(), { uuid: '2ad9', subscribeAsync: async () => {} }),
  ] });
  return p;
};
const fakeNoble = () => {
  const n: any = new EventEmitter();
  n.scans = 0; n.maxConcurrent = 0;
  n.waitForPoweredOnAsync = async () => {};
  n.startScanningAsync = async ([s]: string[]) => {
    n.scans++; n.maxConcurrent = Math.max(n.maxConcurrent, n.scans);
    setTimeout(() => n.emit('discover', peripheral(s)), 5);
  };
  n.stopScanningAsync = async () => { n.scans--; };
  return n;
};
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'noble-'));

test('scans never overlap, so trainer and strap both connect', async () => {
  const n = fakeNoble();
  const port = new NobleBlePort(dir(), n);
  await Promise.all([port.connect('trainer'), port.connect('hr')]);
  expect(n.maxConcurrent).toBe(1);
});
test('a failed connect does not block the next one', async () => {
  const n = fakeNoble();
  const port = new NobleBlePort(dir(), n);
  const orig = n.startScanningAsync;
  n.startScanningAsync = async () => { n.startScanningAsync = orig; throw new Error('bt aus'); };
  await expect(port.connect('trainer')).rejects.toThrow();
  await expect(port.connect('hr')).resolves.toBeUndefined();
});
test('drop during discovery fails the connect so it is retried, and frees the scan', async () => {
  const n = fakeNoble();
  const port = new NobleBlePort(dir(), n);
  const lost: string[] = [];
  port.onDisconnect((k) => lost.push(k));
  n.removeAllListeners('discover');
  n.startScanningAsync = async ([s]: string[]) => {
    n.scans++;
    const p = peripheral(s);
    p.discoverSomeServicesAndCharacteristicsAsync = async () => { p.emit('disconnect'); throw new Error('weg'); };
    setTimeout(() => n.emit('discover', p), 5);
  };
  await expect(port.connect('trainer')).rejects.toThrow();
  expect(lost).toEqual([]);
  expect(n.scans).toBe(0);
});

test('a hanging connect times out, disconnects and frees the queue', async () => {
  const n = fakeNoble();
  const port = new NobleBlePort(dir(), n, { connectTimeoutMs: 20 });
  const disconnect = vi.fn(async () => {});
  n.startScanningAsync = async () => {
    const p = peripheral('1826');
    p.connectAsync = () => new Promise(() => {});
    p.disconnectAsync = disconnect;
    setTimeout(() => n.emit('discover', p), 1);
  };
  await expect(port.connect('trainer')).rejects.toThrow();
  expect(disconnect).toHaveBeenCalled();
});
test('control responses and machine status reach the control callback', async () => {
  const n = fakeNoble();
  const port = new NobleBlePort(dir(), n);
  const got: number[][] = [];
  port.onControl((b) => got.push([...b]));
  const writer: any = Object.assign(new EventEmitter(), { uuid: '2ad9', subscribeAsync: async () => {} });
  const status: any = Object.assign(new EventEmitter(), { uuid: '2ada', subscribeAsync: async () => {} });
  const data: any = Object.assign(new EventEmitter(), { uuid: '2ad2', subscribeAsync: async () => {} });
  n.startScanningAsync = async () => {
    const p = peripheral('1826');
    p.discoverSomeServicesAndCharacteristicsAsync = async () => ({ characteristics: [data, writer, status] });
    setTimeout(() => n.emit('discover', p), 1);
  };
  await port.connect('trainer');
  writer.emit('data', Buffer.from([0x80, 0x05, 0x05]));
  status.emit('data', Buffer.from([0xff]));
  expect(got).toEqual([[0x80, 0x05, 0x05], [0xff]]);
});

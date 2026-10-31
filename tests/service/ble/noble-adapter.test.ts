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

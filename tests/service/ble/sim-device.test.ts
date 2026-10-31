import { DeviceManager, type Reading } from '../../../src/service/ble/device-manager';
import { SimBlePort } from '../../../src/service/ble/sim-device';

const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const setup = async () => {
  const port = new SimBlePort();
  const m = new DeviceManager(port, { retryMs: 5 });
  const r: Reading = {};
  m.onReading((x) => Object.assign(r, x));
  m.start();
  await settle();
  return { port, m, r };
};
const run = (p: SimBlePort, s: number) => { for (let i = 0; i < s; i++) p.step(1); };

test('power follows an ERG target with some lag', async () => {
  const { port, m, r } = await setup();
  m.setTargetPower(200);
  await settle();
  port.step(1);
  expect(r.powerW!).toBeLessThan(200);
  run(port, 30);
  expect(r.powerW).toBeGreaterThanOrEqual(195);
  expect(r.powerW).toBeLessThanOrEqual(205);
  m.stop();
});
test('heart rate rises slowly under load and falls again', async () => {
  const { port, m, r } = await setup();
  m.setTargetPower(250);
  await settle();
  run(port, 10);
  const early = r.hrBpm!;
  run(port, 300);
  const late = r.hrBpm!;
  expect(late).toBeGreaterThan(early);
  m.setTargetPower(80);
  await settle();
  run(port, 300);
  expect(r.hrBpm!).toBeLessThan(late);
  m.stop();
});
test('steeper grade means more power', async () => {
  const { port, m, r } = await setup();
  m.setGrade(1);
  await settle();
  run(port, 60);
  const flat = r.powerW!;
  m.setGrade(8);
  await settle();
  run(port, 60);
  expect(r.powerW!).toBeGreaterThan(flat);
  m.stop();
});
test('trainer data uses the real FTMS wire format', async () => {
  const { port, m, r } = await setup();
  m.setTargetPower(100);
  await settle();
  run(port, 5);
  expect(r.cadenceRpm).toBeGreaterThan(0);
  expect(r.speedKph).toBeGreaterThan(0);
  m.stop();
});

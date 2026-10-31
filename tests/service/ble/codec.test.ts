import { encodeRequestControl, encodeSimulation, encodeTargetPower, parseIndoorBikeData } from '../../../src/service/ble/ftms-codec';
import { parseHeartRate } from '../../../src/service/ble/hr-codec';
test('parses speed, cadence and power by flags', () => {
  const b = Buffer.from([0x44, 0x00, 0xE8, 0x03, 0xB4, 0x00, 0xC8, 0x00]);
  expect(parseIndoorBikeData(b)).toEqual({ speedKph: 10, cadenceRpm: 90, powerW: 200 });
});
test('skips optional fields before power', () => {
  const b = Buffer.from([0x70, 0x00, 0xE8, 0x03, 1, 0, 0, 5, 0, 0x64, 0x00]);
  expect(parseIndoorBikeData(b).powerW).toBe(100);
});
test('more-data flag omits speed', () => {
  expect(parseIndoorBikeData(Buffer.from([0x41, 0x00, 0x64, 0x00]))).toEqual({ powerW: 100 });
});
test('encodes target power', () => expect([...encodeTargetPower(200)]).toEqual([0x05, 0xC8, 0x00]));
test('encodes negative grade', () => expect([...encodeSimulation(-2.5)]).toEqual([0x11, 0, 0, 0x06, 0xFF, 40, 51]));
test('encodes request control', () => expect([...encodeRequestControl()]).toEqual([0x00]));
test('short packet keeps the fields that are complete', () => {
  // Flags versprechen Tempo, Trittfrequenz und Leistung, das Paket endet nach dem Tempo.
  expect(parseIndoorBikeData(Buffer.from([0x44, 0x00, 0xE8, 0x03]))).toEqual({ speedKph: 10 });
});
test('parses uint8 and uint16 heart rate', () => {
  expect(parseHeartRate(Buffer.from([0x00, 150]))).toBe(150);
  expect(parseHeartRate(Buffer.from([0x01, 0x2C, 0x01]))).toBe(300);
});

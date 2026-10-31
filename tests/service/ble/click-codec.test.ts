import { parseClick } from '../../../src/service/ble/click-codec';

// Beispieldaten aus ajchellew/zwiftplay, ZwiftClickTest.kt
test.each([
  [[0x37, 0x08, 0x01, 0x10, 0x01], { plus: false, minus: false }],
  [[0x37, 0x08, 0x00, 0x10, 0x01], { plus: true, minus: false }],
  [[0x37, 0x08, 0x01, 0x10, 0x00], { plus: false, minus: true }],
])('decodes %j', (bytes, expected) => {
  expect(parseClick(Buffer.from(bytes))).toEqual(expected);
});
test.each([
  ['battery', [0x19, 0x08, 0x64]], ['empty', [0x15]], ['handshake reply', [0x52, 0x69, 0x64, 0x65]],
  ['nothing', []], ['truncated varint', [0x37, 0x08]], ['unknown wire type', [0x37, 0x0a, 0x01]],
])('ignores %s', (_n, bytes) => {
  expect(parseClick(Buffer.from(bytes))).toBeNull();
});
test('a missing field means not pressed', () => {
  expect(parseClick(Buffer.from([0x37, 0x08, 0x00]))).toEqual({ plus: true, minus: false });
});

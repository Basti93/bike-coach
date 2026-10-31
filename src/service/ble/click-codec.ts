const CLICK_MESSAGE = 0x37;
const PRESSED = 0;

/** Tastenmeldung des Zwift Click (erste Generation): Protobuf mit Feld 1 = Plus, Feld 2 = Minus, 0 = gedrückt. */
export const parseClick = (b: Buffer): { plus: boolean; minus: boolean } | null => {
  if (b[0] !== CLICK_MESSAGE) return null;
  const result = { plus: false, minus: false };
  let i = 1;
  while (i < b.length) {
    const tag = b[i++];
    if ((tag & 7) !== 0 || i >= b.length || (b[i] & 0x80) !== 0) return null;
    const value = b[i++];
    if (tag >> 3 === 1) result.plus = value === PRESSED;
    if (tag >> 3 === 2) result.minus = value === PRESSED;
  }
  return result;
};

export type BikeData = { speedKph?: number; cadenceRpm?: number; powerW?: number };

export const parseIndoorBikeData = (b: Buffer): BikeData => {
  const out: BikeData = {};
  if (b.length < 2) return out;
  const flags = b.readUInt16LE(0);
  const has = (bit: number) => (flags & (1 << bit)) !== 0;
  let i = 2;
  const fits = (size: number) => i + size <= b.length;
  if (!has(0)) { if (!fits(2)) return out; out.speedKph = b.readUInt16LE(i) / 100; i += 2; }
  if (has(1)) i += 2;
  if (has(2)) { if (!fits(2)) return out; out.cadenceRpm = b.readUInt16LE(i) / 2; i += 2; }
  if (has(3)) i += 2;
  if (has(4)) i += 3;
  if (has(5)) i += 2;
  if (has(6) && fits(2)) out.powerW = b.readInt16LE(i);
  return out;
};

export const encodeRequestControl = (): Buffer => Buffer.from([0x00]);

export const encodeTargetPower = (w: number): Buffer => {
  const b = Buffer.alloc(3);
  b[0] = 0x05;
  b.writeInt16LE(Math.round(w), 1);
  return b;
};

export const encodeSimulation = (gradePct: number): Buffer => {
  const b = Buffer.alloc(7);
  b[0] = 0x11;
  b.writeInt16LE(0, 1);
  b.writeInt16LE(Math.round(gradePct * 100), 3);
  b[5] = 40; // Crr 0.004
  b[6] = 51; // Cw 0.51
  return b;
};

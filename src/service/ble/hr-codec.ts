export const parseHeartRate = (b: Buffer): number => ((b[0] & 1) ? b.readUInt16LE(1) : b[1]);

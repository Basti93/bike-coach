import { Encoder, Profile } from '@garmin/fitsdk';
import { deflateRawSync } from 'node:zlib';

export type Rec = { hr?: number; speed?: number; alt?: number; temp?: number };
/** One record per second from a function of the second; null skips that second (a gap). */
export const buildFit = (seconds: number, at: (s: number) => Rec | null, startMs = Date.UTC(2026, 0, 5, 8, 0, 0)): Uint8Array => {
  const e = new Encoder();
  e.onMesg(Profile.MesgNum.FILE_ID, { type: 'activity', manufacturer: 'development', product: 1, timeCreated: new Date(startMs), serialNumber: 1 });
  let dist = 0;
  for (let s = 0; s < seconds; s++) {
    const r = at(s);
    const speed = r?.speed ?? 0;
    dist += speed;
    if (!r) continue;
    e.onMesg(Profile.MesgNum.RECORD, {
      timestamp: new Date(startMs + s * 1000), heartRate: r.hr, enhancedSpeed: speed, distance: dist,
      enhancedAltitude: r.alt ?? 100, temperature: r.temp,
    });
  }
  return e.close();
};

const crc32 = (b: Uint8Array): number => {
  let c = ~0;
  for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
};

/** A tiny zip with one entry, stored (method 0) or deflated (method 8). */
export const zipOf = (name: string, data: Uint8Array, method: 0 | 8): Buffer => {
  const body = method === 8 ? deflateRawSync(data) : Buffer.from(data);
  const n = Buffer.from(name);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(method, 8);
  h.writeUInt32LE(crc32(data), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22);
  h.writeUInt16LE(n.length, 26);
  // an end-of-central-directory record, so the zip looks complete
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  return Buffer.concat([h, n, body, end]);
};

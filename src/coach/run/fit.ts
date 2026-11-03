import { inflateRawSync } from 'node:zlib';
import { Decoder, Stream } from '@garmin/fitsdk';
import { GRADE_WINDOW_S, MAX_GAP_S, MAX_GRADE, MIN_EASY_S, MIN_SPEED, WARMUP_S } from './limits';

export type RunSample = { t: number; hr: number | null; speed: number | null; distM: number | null; altM: number | null; tempC: number | null };
export type HrBand = { fromBpm: number; toBpm: number };
export type EasyPace = { sPerKm: number; seconds: number };

// Our own choice: a run FIT is a few MB; anything inflating past 64 MiB is not one.
const MAX_UNZIPPED_BYTES = 64 * 1024 * 1024;

const isFit = (b: Uint8Array): boolean => b.length >= 12 && b[8] === 0x2e && b[9] === 0x46 && b[10] === 0x49 && b[11] === 0x54;

/** A bare FIT passes through; from a zip the first `.fit` entry is taken. Anything broken gives null. */
export const unzipFit = (data: Uint8Array): Uint8Array | null => {
  try {
    if (isFit(data)) return data;
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;
    while (pos + 30 <= buf.length && buf.readUInt32LE(pos) === 0x04034b50) {
      const flags = buf.readUInt16LE(pos + 6);
      const method = buf.readUInt16LE(pos + 8);
      const compressed = buf.readUInt32LE(pos + 18);
      const nameLen = buf.readUInt16LE(pos + 26);
      const extraLen = buf.readUInt16LE(pos + 28);
      const start = pos + 30 + nameLen + extraLen;
      if (start > buf.length) return null;
      const name = buf.toString('utf8', pos + 30, pos + 30 + nameLen);
      const sizeKnown = (flags & 8) === 0;
      if (name.toLowerCase().endsWith('.fit')) {
        // With a data descriptor the size is not in the header; inflate stops at the end of the deflate stream.
        if (sizeKnown && start + compressed > buf.length) return null;
        const body = buf.subarray(start, sizeKnown ? start + compressed : buf.length);
        const out = method === 0 ? body : method === 8 ? inflateRawSync(body, { maxOutputLength: MAX_UNZIPPED_BYTES }) : null;
        return out && isFit(out) ? new Uint8Array(out) : null;
      }
      if (!sizeKnown) return null;
      pos = start + compressed;
    }
    return null;
  } catch {
    return null;
  }
};

const numberOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// A strap dropout is sometimes written as 0.
const heartRate = (v: unknown): number | null => { const n = numberOrNull(v); return n !== null && n > 0 ? n : null; };

export const readRunFit = (fit: Uint8Array): RunSample[] | null => {
  try {
    const { messages } = new Decoder(Stream.fromBuffer(Buffer.from(fit))).read();
    const records = (messages?.recordMesgs ?? []) as Record<string, unknown>[];
    const timed = records.filter((r) => r.timestamp instanceof Date);
    if (timed.length === 0) return null;
    const t0 = (timed[0].timestamp as Date).getTime();
    return timed.map((r) => ({
      t: ((r.timestamp as Date).getTime() - t0) / 1000,
      hr: heartRate(r.heartRate),
      speed: numberOrNull(r.enhancedSpeed ?? r.speed),
      distM: numberOrNull(r.distance),
      altM: numberOrNull(r.enhancedAltitude ?? r.altitude),
      tempC: numberOrNull(r.temperature),
    }));
  } catch {
    return null;
  }
};

const gradeBetween = (a: RunSample, b: RunSample): number | null => {
  if (a.altM === null || a.distM === null || b.altM === null || b.distM === null) return null;
  const run = b.distM - a.distM;
  return run > 0 ? (b.altM - a.altM) / run : null;
};

/**
 * Steepest grade around sample i: the half window before it and the half window after it (together GRADE_WINDOW_S, centred),
 * judged separately so a climb is seen from its very first second and not diluted by the flat before it.
 */
const gradeAt = (samples: RunSample[], i: number): number | null => {
  const half = GRADE_WINDOW_S / 2;
  let before = i;
  while (before > 0 && samples[before - 1].t >= samples[i].t - half) before--;
  let after = i;
  while (after < samples.length - 1 && samples[after + 1].t <= samples[i].t + half) after++;
  const grades = [gradeBetween(samples[before], samples[i]), gradeBetween(samples[i], samples[after])].filter((g): g is number => g !== null);
  return grades.length ? grades.reduce((m, g) => (Math.abs(g) > Math.abs(m) ? g : m)) : null;
};

/** Pace over the easy seconds only: after the warm-up, inside the band, flat enough, moving, without record gaps. */
export const easyPace = (samples: RunSample[], band: HrBand): EasyPace | null => {
  let seconds = 0;
  let metres = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const s = samples[i];
    const w = samples[i + 1].t - s.t;
    if (s.t < WARMUP_S || w <= 0 || w > MAX_GAP_S) continue;
    if (s.hr === null || s.hr < band.fromBpm || s.hr > band.toBpm) continue;
    if (s.speed === null || s.speed <= MIN_SPEED) continue;
    const grade = gradeAt(samples, i);
    if (grade !== null && Math.abs(grade) > MAX_GRADE) continue;
    seconds += w;
    metres += s.speed * w;
  }
  if (seconds < MIN_EASY_S || metres <= 0) return null;
  return { sPerKm: Math.round((seconds / metres) * 1000), seconds };
};

// A 1 Hz recording of exactly the window spans one second less than the window.
const TOLERANCE_S = 1;

/** The most distance covered in any window of windowS seconds. */
export const bestWindowDistance = (samples: RunSample[], windowS: number): number | null => {
  const withDist = samples.filter((s): s is RunSample & { distM: number } => s.distM !== null);
  let best: number | null = null;
  let j = 0;
  for (let i = 0; i < withDist.length; i++) {
    const end = withDist[i];
    if (end.t - withDist[0].t < windowS - TOLERANCE_S) continue;
    while (j + 1 <= i && withDist[j + 1].t <= end.t - windowS) j++;
    const d = end.distM - withDist[j].distM;
    if (best === null || d > best) best = d;
  }
  return best;
};

export const avgTemp = (samples: RunSample[]): number | null => {
  const temps = samples.map((s) => s.tempC).filter((v): v is number => v !== null);
  return temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
};

/** False for a file that is cut off, as one still syncing: a FIT shorter than its header says, or a zip without its end record. */
export const looksComplete = (data: Uint8Array): boolean => {
  if (data.length < 14) return false;
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (isFit(data)) return buf.length >= buf[0] + buf.readUInt32LE(4) + 2;
  return buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) >= 0;
};

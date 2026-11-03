import fs from 'node:fs';
import path from 'node:path';
import { exportFit } from '../../service/export/fit';
import { readRide } from '../../service/recorder';
import { RIDE_FILE_NAMES, RIDE_ID, readRideFiles, rideHash, type RideFiles } from '../ride-upload-format';

export type StoreResult = { ok: true; sha256: string; same: boolean } | { ok: false; reason: 'invalid' | 'hash' | 'open' | 'profile' };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const writeSynced = (file: string, data: string | Buffer): void => {
  const fd = fs.openSync(file, 'w', 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
};

type Parsed = { rideId: string; files: RideFiles; fit: Buffer | null; sha256: string; meta: Record<string, unknown> };

const parseUpload = (upload: unknown): Parsed | null => {
  if (!isObj(upload) || upload.v !== 1 || typeof upload.rideId !== 'string' || !RIDE_ID.test(upload.rideId)) return null;
  if (typeof upload.sha256 !== 'string' || !isObj(upload.files)) return null;
  const f = upload.files;
  if (RIDE_FILE_NAMES.some((n) => typeof f[n] !== 'string')) return null;
  if (upload.fit !== null && typeof upload.fit !== 'string') return null;
  const files = Object.fromEntries(RIDE_FILE_NAMES.map((n) => [n, f[n] as string])) as RideFiles;
  let meta: unknown;
  try { meta = JSON.parse(files['meta.json']); JSON.parse(files['session.json']); } catch { return null; }
  if (!isObj(meta) || meta.rideId !== upload.rideId || typeof meta.profileId !== 'string' || typeof meta.status !== 'string') return null;
  const fit = typeof upload.fit === 'string' && upload.fit.length > 0 ? Buffer.from(upload.fit, 'base64') : null;
  return { rideId: upload.rideId, files, fit, sha256: upload.sha256, meta };
};

/**
 * Stores a finished ride of the Mac in the recorder's layout. The files go to `.incoming-<rideId>` first and are renamed in one step,
 * so a crash leaves no half ride under the real name. A changed copy moves the old folder to `<rideId>.replaced-<ms>`; nothing is deleted.
 */
export const storeRide = (opts: { ridesDir: string; profileId: string; upload: unknown; nowMs: number }): StoreResult => {
  const u = parseUpload(opts.upload);
  if (!u) return { ok: false, reason: 'invalid' };
  if (rideHash(u.files) !== u.sha256) return { ok: false, reason: 'hash' };
  // Only a closed ride counts: open and discarded ones stay on the Mac.
  if (u.meta.status !== 'finished' && u.meta.status !== 'aborted') return { ok: false, reason: 'open' };
  if (u.meta.profileId !== opts.profileId) return { ok: false, reason: 'profile' };

  const { ridesDir } = opts;
  const finalDir = path.join(ridesDir, u.rideId);
  const incoming = path.join(ridesDir, `.incoming-${u.rideId}`);
  fs.mkdirSync(path.join(ridesDir, 'exports'), { recursive: true });

  if (fs.existsSync(finalDir)) {
    try { if (rideHash(readRideFiles(finalDir)) === u.sha256) return { ok: true, sha256: u.sha256, same: true }; } catch { /* unreadable copy: replace it */ }
  }

  fs.rmSync(incoming, { recursive: true, force: true });
  fs.mkdirSync(incoming, { mode: 0o700 });
  try {
    for (const n of RIDE_FILE_NAMES) writeSynced(path.join(incoming, n), u.files[n]);
    // A FIT file from the Mac is kept; otherwise one is made from the samples.
    const fit = u.fit ?? exportFit(readRide(ridesDir, `.incoming-${u.rideId}`));
    const fitFile = path.join(ridesDir, 'exports', `${u.rideId}.fit`);
    writeSynced(`${fitFile}.incoming`, fit);
    if (fs.existsSync(finalDir)) fs.renameSync(finalDir, path.join(ridesDir, `${u.rideId}.replaced-${opts.nowMs}`));
    fs.renameSync(incoming, finalDir);
    fs.renameSync(`${fitFile}.incoming`, fitFile);
  } catch (e) {
    fs.rmSync(incoming, { recursive: true, force: true });
    throw e;
  }
  return { ok: true, sha256: u.sha256, same: false };
};

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseProfile, type Profile } from '../../shared/profiles';
import { readRideFiles, rideHash } from '../ride-upload-format';
import type { Manifest, MigrationItem } from '../server/migration';
import { CoachHttpError, type CoachHttp } from './coach-http';
import { markMoved, remoteDir } from './home';
import type { RideUploads } from './ride-upload';

export type MigrateResult = { state: 'done' } | { state: 'refused'; reason: 'other-profile' } | { state: 'paused' } | { state: 'failed' };

export type MigrateOptions = {
  /** Holds `rides/`, `coach/`, `garmin/` and `hevy/`, as the Mac keeps them. Only read, never changed. */
  root: string;
  profileId: string;
  http: CoachHttp;
  uploads: RideUploads;
  /** True once every record of the profile is on the server: until then the switch waits. */
  recordsSettled: () => boolean;
  /** False while a ride is open. Checked before every request. */
  noOpenRide: () => boolean;
  progress: (done: number, total: number) => void;
  nowMs?: () => number;
};

/** How often one run takes a fresh snapshot when the live data keeps changing under it. */
const MAX_ROUNDS = 3;

type Source = { name: MigrationItem; file: string; kind: 'copy' | 'database' | 'secret' };
/** What the Mac holds for a profile, by item. Secrets are never copied: they are hashed and streamed from where they live. */
const sources = (root: string, p: string): Source[] => {
  const coach = path.join(root, 'coach');
  return [
    { name: 'coach-state', file: path.join(coach, `${encodeURIComponent(p)}.json`), kind: 'copy' },
    { name: 'gym-state', file: path.join(coach, 'gym', `${encodeURIComponent(p)}.json`), kind: 'copy' },
    { name: 'garmin-db', file: path.join(root, 'garmin', 'data', p, 'garmin.db'), kind: 'database' },
    { name: 'garmin-sync-meta', file: path.join(root, 'garmin', 'data', p, 'sync-meta.json'), kind: 'copy' },
    { name: 'hevy-workouts', file: path.join(root, 'hevy', p, 'workouts.json'), kind: 'copy' },
    { name: 'hevy-templates', file: path.join(root, 'hevy', p, 'templates.json'), kind: 'copy' },
    { name: 'hevy-key', file: path.join(root, 'hevy', p, 'api-key'), kind: 'secret' },
    { name: 'garmin-tokens', file: path.join(root, 'garmin', 'tokens', p, 'garmin_tokens.json'), kind: 'secret' },
  ];
};

/** What a run compares to see whether the live data changed since its snapshot. */
type Snapshot = {
  manifest: Manifest;
  /** Per item, how the live file looked when the snapshot was taken: absent, a content hash, or for the database its files' sizes and times. */
  live: Record<string, string>;
  /** The item's bytes to send: the staged copy, or for a secret its own file. */
  files: Partial<Record<MigrationItem, string>>;
};

const hashFile = async (file: string): Promise<{ sha256: string; bytes: number }> => {
  const h = createHash('sha256');
  let bytes = 0;
  for await (const c of fs.createReadStream(file) as AsyncIterable<Buffer>) { h.update(c); bytes += c.length; }
  return { sha256: h.digest('hex'), bytes };
};

const statOf = (file: string): string => { try { const s = fs.statSync(file); return `${s.size}:${s.mtimeMs}`; } catch { return '-'; } };

/** How a live file looks now. The database by its files, as hashing it whole on every check costs too much. */
const fingerprint = async (s: Source): Promise<string> => {
  if (!fs.existsSync(s.file)) return 'absent';
  if (s.kind === 'database') return `db ${statOf(s.file)} ${statOf(`${s.file}-wal`)}`;
  try { return (await hashFile(s.file)).sha256; } catch { return 'absent'; }
};

const readProfile = (root: string, profileId: string): Profile | null => {
  try {
    const all = JSON.parse(fs.readFileSync(path.join(root, 'rides', 'profiles.json'), 'utf8')) as unknown;
    if (!Array.isArray(all)) return null;
    const p = all.find((x) => typeof x === 'object' && x !== null && (x as { id?: unknown }).id === profileId);
    return p ? parseProfile(p) : null;
  } catch { return null; }
};

/** A copy of the database with what still sits in its write-ahead log, read through SQLite. */
const vacuumInto = (from: string, to: string): void => {
  fs.rmSync(to, { force: true });
  const db = new DatabaseSync(from, { readOnly: true });
  try { db.exec(`VACUUM INTO '${to.replace(/'/g, "''")}'`); } finally { db.close(); }
};

const writeJson = (file: string, data: unknown): void => {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
  fs.renameSync(`${file}.tmp`, file);
};

/**
 * Moves a linked profile to the server coach, once. Everything the Mac holds for it goes up checked by hash: a snapshot of the
 * coach files in `<coachDir>/remote/<profileId>/staging/`, the rides through the ride uploads, the secrets straight from their
 * files. Before the switch the live files are checked again; a change starts a fresh snapshot. The profile counts as moved only
 * when the server says done. A cut-off run resumes with the same snapshot and skips what the server already holds. The local
 * files are never changed, and nothing is logged.
 */
export const migrate = async (opts: MigrateOptions): Promise<MigrateResult> => {
  const { root, profileId: p, http } = opts;
  const nowMs = opts.nowMs ?? (() => Date.now());
  const coachDir = path.join(root, 'coach');
  const staging = path.join(remoteDir(coachDir, p), 'staging');
  const saved = path.join(staging, 'snapshot.json');
  const may = (): boolean => { try { return opts.noOpenRide(); } catch { return false; } };
  const settled = (): boolean => { try { return opts.recordsSettled(); } catch { return false; } };
  const progress = (done: number, total: number): void => { try { opts.progress(done, total); } catch { /* only a display */ } };
  const all = sources(root, p);

  const liveNow = async (): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    for (const s of all) out[s.name] = await fingerprint(s);
    const profile = readProfile(root, p);
    out.profile = profile ? JSON.stringify(profile) : 'absent';
    out.rides = opts.uploads.closed(p).join(',');
    return out;
  };
  const same = (a: Record<string, string>, b: Record<string, string>): boolean =>
    Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

  /** The snapshot an earlier run left, when the live data is still as it was then. */
  const resume = async (): Promise<Snapshot | null> => {
    let s: Snapshot;
    try { s = JSON.parse(fs.readFileSync(saved, 'utf8')) as Snapshot; } catch { return null; }
    if (!s || typeof s !== 'object' || !s.manifest || !s.live || !s.files) return null;
    if (!Object.values(s.files).every((f) => typeof f === 'string' && fs.existsSync(f))) return null;
    return same(s.live, await liveNow()) ? s : null;
  };

  const take = async (): Promise<Snapshot | null> => {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true, mode: 0o700 });
    // Looked at first, so a change while copying shows up at the check before the switch.
    const live = await liveNow();
    const profile = readProfile(root, p);
    if (!profile) return null;
    const items: Manifest['items'] = [];
    const files: Snapshot['files'] = {};
    for (const s of all) {
      if (live[s.name] === 'absent') continue;
      let file = s.file;
      try {
        if (s.kind === 'database') { file = path.join(staging, s.name); vacuumInto(s.file, file); }
        else if (s.kind === 'copy') { file = path.join(staging, s.name); fs.copyFileSync(s.file, file); }
        const h = await hashFile(file);
        items.push({ name: s.name, ...h });
        files[s.name] = file;
      } catch {
        // Gone between the look and the copy: the check before the switch sees it.
        continue;
      }
    }
    const rides: Manifest['rides'] = [];
    for (const rideId of opts.uploads.closed(p)) {
      try { rides.push({ rideId, sha256: rideHash(readRideFiles(path.join(root, 'rides', rideId))) }); } catch { /* unreadable: not part of the move */ }
    }
    const snap: Snapshot = { manifest: { profile, rides, items }, live, files };
    writeJson(saved, snap);
    return snap;
  };

  const done = (counts: { rides: number; items: number }): MigrateResult => {
    markMoved(coachDir, p, { atMs: nowMs(), counts });
    fs.rmSync(staging, { recursive: true, force: true });
    return { state: 'done' };
  };

  /** One pass with one snapshot: 'changed' when the live data moved on under it. */
  const pass = async (snap: Snapshot): Promise<MigrateResult | 'changed'> => {
    const m = snap.manifest;
    if (!may()) return { state: 'paused' };
    const b = await http.begin(m);
    if (b.state === 'refused') return { state: 'refused', reason: 'other-profile' };
    if (b.state === 'done') return done({ rides: m.rides.length, items: m.items.length });
    const total = m.rides.length + m.items.length;
    let count = 0;
    const haveRides = new Set(b.haveRides);
    const haveItems = new Set(b.haveItems);
    for (const r of m.rides) if (haveRides.has(r.rideId)) { opts.uploads.remember(p, r.rideId, r.sha256); count++; }
    for (const i of m.items) if (haveItems.has(i.name)) count++;
    progress(count, total);
    for (const r of m.rides) {
      if (haveRides.has(r.rideId)) continue;
      if (!may()) return { state: 'paused' };
      await opts.uploads.upload(p, r.rideId, http);
      progress(++count, total);
    }
    for (const i of m.items) {
      if (haveItems.has(i.name)) continue;
      if (!may()) return { state: 'paused' };
      await http.putItem(i.name, snap.files[i.name]!, i.sha256);
      progress(++count, total);
    }
    if (!same(snap.live, await liveNow())) return 'changed';
    // Records made here before the switch must be on the server first.
    if (!settled() || !may()) return { state: 'paused' };
    let f;
    try { f = await http.finish(m); } catch (e) {
      // A cut connection or a timeout: the finish is asked again next time with the same snapshot, never counted as failed.
      if (e instanceof CoachHttpError && e.kind === 'offline') return { state: 'paused' };
      throw e;
    }
    if (f.state === 'missing') return { state: 'failed' };
    return done(f.counts);
  };

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (!may()) return { state: 'paused' };
      const snap = (round === 0 ? await resume() : null) ?? await take();
      if (!snap) return { state: 'failed' };
      const out = await pass(snap);
      if (out !== 'changed') return out;
    }
    return { state: 'failed' };
  } catch {
    return { state: 'failed' };
  }
};

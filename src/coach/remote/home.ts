import fs from 'node:fs';
import path from 'node:path';

const SAFE_ID = /^[A-Za-z0-9-]+$/;

/** The folder for a profile's server coach on this Mac: the moved marker, the cached state and the queue. */
export const remoteDir = (coachDir: string, profileId: string): string => path.join(coachDir, 'remote', profileId);
const marker = (coachDir: string, profileId: string): string => path.join(remoteDir(coachDir, profileId), 'moved.json');

/** Where a profile's coach runs. A moved profile without a link (unlinked, or never linked here) is local again. */
export const homeOf = (coachDir: string, profileId: string, linked: boolean): 'local' | 'server' => {
  if (!linked || !SAFE_ID.test(profileId)) return 'local';
  return fs.existsSync(marker(coachDir, profileId)) ? 'server' : 'local';
};

/** The move finished: from now on the server coaches this profile. */
export const markMoved = (coachDir: string, profileId: string, info: { atMs: number; counts: { rides: number; items: number } }): void => {
  if (!SAFE_ID.test(profileId)) throw new Error('invalid profile id');
  const dir = remoteDir(coachDir, profileId);
  fs.mkdirSync(dir, { recursive: true });
  const f = marker(coachDir, profileId);
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(info));
  fs.renameSync(`${f}.tmp`, f);
};

/**
 * Back to the local coach. The cached server state and the queue are set aside (renamed, never deleted), so a later move
 * starts clean and never sends writes from before the unlink.
 */
export const clearMoved = (coachDir: string, profileId: string, nowMs: number = Date.now()): void => {
  if (!SAFE_ID.test(profileId)) return;
  fs.rmSync(marker(coachDir, profileId), { force: true });
  const dir = remoteDir(coachDir, profileId);
  for (const name of ['state', 'queue']) {
    try { fs.renameSync(path.join(dir, `${name}.json`), path.join(dir, `${name}.unlinked-${nowMs}.json`)); } catch { /* not there */ }
  }
};

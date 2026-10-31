import fs from 'node:fs';
import path from 'node:path';
import type { Sample } from '../shared/sample';
import { readMeta, type RideMeta } from './recorder';

export const findOpenRides = (dir: string): RideMeta[] => {
  if (!fs.existsSync(dir)) return [];
  const open: RideMeta[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!fs.existsSync(path.join(dir, name, 'meta.json'))) continue;
    try {
      const meta = readMeta(dir, name);
      if (meta.status === 'open') open.push(meta);
    } catch { /* unlesbare Fahrt darf den Start nicht verhindern */ }
  }
  return open;
};

export const resumePoint = (ride: { samples: Sample[] }): { resumeAtS: number; startSeq: number } => {
  const last = ride.samples.at(-1);
  return last ? { resumeAtS: last.rideElapsedS, startSeq: last.seq + 1 } : { resumeAtS: 0, startSeq: 0 };
};

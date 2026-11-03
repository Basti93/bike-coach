import type { GarminDb, GarminRun } from '../garmin-db';
import { PACE_TYPES, type RunType } from '../../shared/run';
import { avgTemp, bestWindowDistance, easyPace, looksComplete, readRunFit, unzipFit, type EasyPace, type HrBand, type RunSample } from './fit';
import { TEST_WINDOW_S } from './limits';

export type Run = {
  id: string; source: 'garmin' | 'manual'; type: RunType; startMs: number; durationS: number; distanceM: number | null;
  avgHr: number | null; maxHr: number | null; elevationGainM: number | null; hasHr: boolean;
  easyPace: EasyPace | null; best30M: number | null; tempC: number | null;
};
/** Per run `<id>` holds what does not depend on the heart-rate band (easyPace null); `<id>:<from>-<to>` adds the pace for that band. */
export type PaceCache = Record<string, { easyPace: EasyPace | null; best30M: number | null; tempC: number | null; hasHr: boolean }>;

type Derived = PaceCache[string];

const readSamples = (db: Pick<GarminDb, 'activityFile'>, id: string): { samples: RunSample[] | null; cacheable: boolean } | null => {
  const file = db.activityFile(id);
  if (!file) return null;
  const fit = unzipFit(file);
  return { samples: fit ? readRunFit(fit) : null, cacheable: looksComplete(file) };
};

/**
 * Garmin runs with a pace from their FIT file. The cache is filled and pruned in place. A run without a file, or with a
 * file that looks cut off, is not cached, so the finished file is picked up later. A complete but unreadable file is cached.
 */
export const garminRuns = (db: Pick<GarminDb, 'runs' | 'activityFile'>, fromMs: number, band: HrBand | null, cache: PaceCache): Run[] => {
  const runs = db.runs(fromMs);
  const bandKey = band ? `${band.fromBpm}-${band.toBpm}` : null;
  const keep = new Set(runs.flatMap((r) => (bandKey ? [r.id, `${r.id}:${bandKey}`] : [r.id])));
  for (const key of Object.keys(cache)) if (!keep.has(key)) delete cache[key];

  return runs.map((r: GarminRun): Run => {
    const wantsPace = bandKey !== null && PACE_TYPES.includes(r.type);
    const paceKey = `${r.id}:${bandKey}`;
    let derived: Derived | undefined = wantsPace ? cache[paceKey] : cache[r.id];
    if (!derived) {
      const read = readSamples(db, r.id);
      const samples = read?.samples ?? null;
      const base: Derived = samples
        ? { hasHr: samples.some((s) => s.hr !== null), easyPace: null, best30M: bestWindowDistance(samples, TEST_WINDOW_S), tempC: avgTemp(samples) }
        : { hasHr: r.avgHr !== null, easyPace: null, best30M: null, tempC: null };
      derived = wantsPace && samples && band ? { ...base, easyPace: easyPace(samples, band) } : base;
      if (read?.cacheable) {
        cache[r.id] = base;
        if (wantsPace) cache[paceKey] = derived;
      }
    }
    return { ...r, source: 'garmin', ...derived };
  });
};

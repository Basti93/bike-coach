import type { GarminDb, GarminRun } from '../garmin-db';
import { PACE_TYPES, type RunType } from '../../shared/run';
import { avgTemp, bestWindowDistance, easyPace, readRunFit, unzipFit, type EasyPace, type HrBand } from './fit';
import { TEST_WINDOW_S } from './limits';

export type Run = {
  id: string; source: 'garmin' | 'manual'; type: RunType; startMs: number; durationS: number; distanceM: number | null;
  avgHr: number | null; maxHr: number | null; elevationGainM: number | null; hasHr: boolean;
  easyPace: EasyPace | null; best30M: number | null; tempC: number | null;
};
export type PaceCache = Record<string, { easyPace: EasyPace | null; best30M: number | null; tempC: number | null; hasHr: boolean }>;

/** Garmin runs with a pace from their FIT file. The cache is filled in place; a run without a file is not cached, so a later file is picked up. */
export const garminRuns = (db: Pick<GarminDb, 'runs' | 'activityFile'>, fromMs: number, band: HrBand | null, cache: PaceCache): Run[] =>
  db.runs(fromMs).map((r: GarminRun) => {
    const key = `${r.id}:${band ? `${band.fromBpm}-${band.toBpm}` : 'none'}`;
    let derived = cache[key];
    if (!derived) {
      const file = db.activityFile(r.id);
      const fit = file ? unzipFit(file) : null;
      const samples = fit ? readRunFit(fit) : null;
      derived = samples
        ? {
          hasHr: samples.some((s) => s.hr !== null),
          easyPace: band && PACE_TYPES.includes(r.type) ? easyPace(samples, band) : null,
          best30M: bestWindowDistance(samples, TEST_WINDOW_S),
          tempC: avgTemp(samples),
        }
        : { hasHr: r.avgHr !== null, easyPace: null, best30M: null, tempC: null };
      if (file) cache[key] = derived;
    }
    return { ...r, source: 'garmin', ...derived };
  });

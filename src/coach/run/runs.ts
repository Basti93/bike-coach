import { overlapsByHalf } from '../all-training';
import { PACE_TYPES, readRunBody, runIdType } from '../../shared/run';
import type { TrackedRecord } from '../../shared/records';
import type { Run } from './garmin-runs';
import type { HrBand } from './fit';

/**
 * Runs entered by hand. A record counts only when its id says manual and its body is a valid manual run. The pace is the
 * whole run, but only with a heart rate inside the band, on a run type whose pace says something, and with a distance.
 */
export const manualRuns = (records: TrackedRecord[], band: HrBand | null): Run[] => {
  const runs: Run[] = [];
  for (const rec of records) {
    if (rec.kind !== 'run' || rec.deleted || runIdType(rec.id) !== 'manual') continue;
    const b = readRunBody(rec.body);
    if (!b || b.type !== 'manual') continue;
    const inBand = band !== null && b.avgHr !== null && b.avgHr >= band.fromBpm && b.avgHr <= band.toBpm;
    const easy = inBand && PACE_TYPES.includes(b.runType) && b.distanceM > 0 && b.durationS > 0;
    runs.push({
      id: rec.id, source: 'manual', type: b.runType, startMs: b.startMs, durationS: b.durationS, distanceM: b.distanceM,
      avgHr: b.avgHr, maxHr: null, elevationGainM: null, hasHr: b.avgHr !== null,
      easyPace: easy ? { sPerKm: b.durationS / (b.distanceM / 1000), seconds: b.durationS } : null,
      best30M: b.distanceM, tempC: null,
    });
  }
  return runs;
};

/** One run counts once: a manual run that overlaps a Garmin run of the same type by half is dropped. */
export const mergeRuns = (garmin: Run[], manual: Run[]): Run[] =>
  [...garmin, ...manual.filter((m) => !garmin.some((g) => g.type === m.type && overlapsByHalf(g, m)))].sort((a, b) => a.startMs - b.startMs);

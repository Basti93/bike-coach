export const RUN_TYPES = ['running', 'trail_running', 'track_running', 'treadmill_running'] as const;
export type RunType = typeof RUN_TYPES[number];
/** Only these have a pace worth comparing: no hills, no belt. */
export const PACE_TYPES: readonly RunType[] = ['running', 'track_running'];
export type RunKind = 'easy' | 'long' | 'test';
export type PlannedRun = { date: string; kind: RunKind; minutes: number; hrCap: number | null; counts: string; note: string | null };

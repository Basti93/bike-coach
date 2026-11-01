import data from './passes-data.json';

/** Real climbs: route from BRouter over OpenStreetMap, heights every 100 m, see docs/pass-rides.md. */
export type Pass = { id: string; name: string; country: string; lengthM: number; gainM: number; stepM: number; heights: number[] };
export const PASSES: Pass[] = data;
export const DEFAULT_PASS_ID = 'alpe-dhuez';
export const passById = (id: string | undefined): Pass => PASSES.find((p) => p.id === id) ?? PASSES.find((p) => p.id === DEFAULT_PASS_ID)!;

export type PassState = { selectedId?: string; distanceM?: Record<string, number>; summits?: { passId: string; atMs: number }[] };

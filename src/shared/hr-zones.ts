import type { Step } from './session';

// Grundlagen und Grenzen: docs/hr-zones.md.
const YEAR_MS = 365.25 * 86_400_000;
export const ZONES = [1, 2, 3, 4, 5] as const;

export type HrMax = { bpm: number; estimated: boolean };

/** Der eigene Wert gilt. Sonst Tanaka (208 − 0,7 × Alter), Fehler rund ±10 Schläge, deshalb als Schätzung markiert. */
export const hrMaxFor = (p: { hrMaxBpm?: number; birthDate?: string }, nowMs: number): HrMax | null => {
  if (p.hrMaxBpm) return { bpm: p.hrMaxBpm, estimated: false };
  const birth = p.birthDate ? Date.parse(p.birthDate) : NaN;
  if (Number.isNaN(birth)) return null;
  return { bpm: Math.round(208 - 0.7 * Math.floor((nowMs - birth) / YEAR_MS)), estimated: true };
};

/** Zone 1 beginnt bei 50 % des Maximalpulses, je Zone 10 Prozentpunkte. */
export const zoneBounds = (zone: number, hrMaxBpm: number): { fromBpm: number; toBpm: number } => ({
  fromBpm: Math.round(((40 + zone * 10) / 100) * hrMaxBpm),
  toBpm: Math.round(((50 + zone * 10) / 100) * hrMaxBpm),
});

/** 0 heißt unter Zone 1. Über 100 % zählt zu Zone 5. */
export const zoneOf = (hrBpm: number, hrMaxBpm: number): number => {
  const pct = (hrBpm / hrMaxBpm) * 100;
  return pct < 50 ? 0 : Math.min(5, Math.floor((pct - 40) / 10));
};

/** Vom Coach gesetzt oder grob aus den Watt abgeleitet (eigene Setzung). */
export const stepTargetZone = (s: Step): number => {
  if (s.hrZone) return s.hrZone;
  const f = s.kind === 'erg' ? s.ftpFraction : Math.max(0.5, 0.55 + (s.gradePct * s.scale) / 20);
  if (f <= 0.55) return 2;
  if (f <= 0.75) return 3;
  if (f <= 0.9) return 4;
  return 5;
};

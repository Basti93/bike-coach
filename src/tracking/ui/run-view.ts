import type { TrackedRecord } from '../../shared/records';
import { weekOf } from '../../shared/meals';
import { readRunBody, runIdType, type RunReviewBody, type RunSettingsBody, type RunStatusBody, type RunWeekBody } from '../../shared/run';

export type RunView = { status: RunStatusBody | null; settings: RunSettingsBody | null; week: RunWeekBody | null; reviews: RunReviewBody[]; visible: boolean };

/** The readable run records. A record whose id and body type disagree is ignored, as is anything deleted or odd. */
export function runView(records: TrackedRecord[], nowMs: number): RunView {
  let status: RunStatusBody | null = null;
  let settings: RunSettingsBody | null = null;
  const weeks: RunWeekBody[] = [];
  const reviews: RunReviewBody[] = [];
  for (const r of records) {
    if (r.deleted) continue;
    const body = readRunBody(r.body);
    if (!body || runIdType(r.id) !== body.type) continue;
    if (body.type === 'status') status = body;
    else if (body.type === 'settings') settings = body;
    else if (body.type === 'week') weeks.push(body);
    else if (body.type === 'review') reviews.push(body);
  }
  // This week's plan; before it exists, the next one that does.
  const current = weekOf(nowMs);
  const week = weeks.find((w) => w.week === current) ?? weeks.filter((w) => w.week > current).sort((a, b) => a.week.localeCompare(b.week))[0] ?? null;
  reviews.sort((a, b) => b.week.localeCompare(a.week));
  return { status, settings, week, reviews, visible: !!(status?.on || status?.suggest) };
}

/** Writes follow the existing pattern: always above what is there, tombstones included. */
export const nextUpdatedMs = (now: number, have: TrackedRecord | undefined): number => Math.max(now, (have?.updatedMs ?? 0) + 1);

export const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;
export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

export const dateKeyOf = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** "Mittwoch, 4.11." */
export const dayText = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' });
};
export const kmFromKm = (km: number): string => `${km.toFixed(1).replace('.', ',')} km`;

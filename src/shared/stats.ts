import type { PlanMode } from './frame';
import type { TodayAdvice } from './today';
import { SPORTS as PLAN_SPORTS } from './week-plan';

export const STATS_ID = 'stats';
export type Sport = 'bike' | 'strength' | 'run' | 'mobility' | 'other';
export const SPORTS: readonly Sport[] = ['bike', 'strength', 'run', 'mobility', 'other'];
export type StatsDay = { date: string; minutes: Record<Sport, number>; hardness: 'easy' | 'moderate' | 'hard' | null; legs: boolean };
/**
 * What the coach advised for one date, so every device shows the same line (the app does not see the bike rides). Only good for
 * its `date` and the plan `mode` it was made in.
 */
export type PublishedAdvice = TodayAdvice & { date: string; mode: PlanMode };
/** `ftp` and `weightKg` are optional: the bike coach's FTP history (last half year) and the profile weight, for the progress card. */
export type StatsBody = { type: 'stats'; atMs: number; goal: string | null; days: StatsDay[]; muscles: Record<string, string>; ftp?: { atMs: number; ftpW: number }[]; weightKg?: number | null; advice?: PublishedAdvice };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function readDay(x: unknown): StatsDay | null {
  if (!isObj(x) || typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return null;
  if (!isObj(x.minutes) || typeof x.legs !== 'boolean') return null;
  if (x.hardness !== null && x.hardness !== 'easy' && x.hardness !== 'moderate' && x.hardness !== 'hard') return null;
  const minutes = {} as Record<Sport, number>;
  for (const s of SPORTS) {
    const m = x.minutes[s];
    if (typeof m !== 'number' || !Number.isFinite(m) || m < 0 || m > 1440) return null;
    minutes[s] = m;
  }
  return { date: x.date, minutes, hardness: x.hardness, legs: x.legs };
}

const HARDNESS = ['easy', 'moderate', 'hard'];
const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 300;
const isSport = (x: unknown): boolean => (PLAN_SPORTS as readonly unknown[]).includes(x);
const readPart = (x: unknown): { sport: TodayAdvice['sport']; hardness: TodayAdvice['hardness'] } | null =>
  isObj(x) && isSport(x.sport) && HARDNESS.includes(x.hardness as string) ? { sport: x.sport as TodayAdvice['sport'], hardness: x.hardness as TodayAdvice['hardness'] } : null;

/** The published advice, or null when it is not whole. */
export function readAdvice(x: unknown): PublishedAdvice | null {
  if (!isObj(x) || typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date) || (x.mode !== 'week' && x.mode !== 'spontaneous')) return null;
  const first = readPart(x);
  if (!first || !text(x.label) || !text(x.reason) || !text(x.line) || typeof x.fromPlan !== 'boolean') return null;
  const also = x.also === undefined ? undefined : readPart(x.also);
  if (also === null) return null;
  if (x.legs !== undefined && typeof x.legs !== 'boolean') return null;
  return { ...first, ...(also ? { also } : {}), label: x.label, reason: x.reason, line: x.line, fromPlan: x.fromPlan, ...(x.legs !== undefined ? { legs: x.legs } : {}), date: x.date, mode: x.mode };
}

/** The stats body, or null for anything that does not match. */
export function readStats(body: unknown): StatsBody | null {
  if (!isObj(body) || body.type !== 'stats') return null;
  if (typeof body.atMs !== 'number' || !Number.isFinite(body.atMs)) return null;
  if (body.goal !== null && (typeof body.goal !== 'string' || body.goal.length > 40)) return null;
  if (!Array.isArray(body.days) || body.days.length > 70) return null;
  const days: StatsDay[] = [];
  for (const d of body.days) {
    const day = readDay(d);
    if (!day || (days.length > 0 && day.date <= days[days.length - 1].date)) return null;
    days.push(day);
  }
  if (!isObj(body.muscles)) return null;
  const entries = Object.entries(body.muscles);
  if (entries.length > 500) return null;
  for (const [k, v] of entries) if (typeof v !== 'string' || v.length > 100 || k.length > 100) return null;
  // Rebuilt from own keys only; fromEntries keeps a key like __proto__ as an own key.
  const muscles = Object.fromEntries(entries) as Record<string, string>;
  const out: StatsBody = { type: 'stats', atMs: body.atMs, goal: body.goal, days, muscles };
  // Optional and read leniently: a broken entry is dropped, never the whole record.
  if (Array.isArray(body.ftp)) out.ftp = body.ftp.slice(0, 50).flatMap((h) => (isObj(h) && typeof h.atMs === 'number' && Number.isFinite(h.atMs) && typeof h.ftpW === 'number' && h.ftpW > 0 && h.ftpW < 2000 ? [{ atMs: h.atMs, ftpW: h.ftpW }] : []));
  const advice = readAdvice(body.advice);
  if (advice) out.advice = advice;
  if (typeof body.weightKg === 'number' && body.weightKg > 20 && body.weightKg < 400) out.weightKg = body.weightKg;
  return out;
}

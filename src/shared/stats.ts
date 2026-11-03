export const STATS_ID = 'stats';
export type Sport = 'bike' | 'strength' | 'run' | 'mobility' | 'other';
export const SPORTS: readonly Sport[] = ['bike', 'strength', 'run', 'mobility', 'other'];
export type StatsDay = { date: string; minutes: Record<Sport, number>; hardness: 'easy' | 'moderate' | 'hard' | null; legs: boolean };
/** `ftp` and `weightKg` are optional: the bike coach's FTP history (last half year) and the profile weight, for the progress card. */
export type StatsBody = { type: 'stats'; atMs: number; goal: string | null; days: StatsDay[]; muscles: Record<string, string>; ftp?: { atMs: number; ftpW: number }[]; weightKg?: number | null };

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
  if (typeof body.weightKg === 'number' && body.weightKg > 20 && body.weightKg < 400) out.weightKg = body.weightKg;
  return out;
}

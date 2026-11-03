import { ClaudeError } from '../claude-client';
import { crossSportCut, type DayRating } from '../day-load';
import type { GarminDb } from '../garmin-db';
import type { TrainingWeek } from '../all-training';
import type { Complaint } from '../motivation';
import type { RecordStore } from '../tracking/store';
import type { Profile } from '../../shared/profiles';
import type { TrackedRecord } from '../../shared/records';
import { addWeeks, dateKey, dateOf, dayIndex, weekOf } from '../../shared/meals';
import {
  readRunBody, runFp, runIdType, runReviewId, runWeekId, RUN_SETTINGS_ID, RUN_STATUS_ID,
  type PlannedRun, type RunBody, type RunGarmin, type RunReviewBody, type RunSettingsBody, type RunStatusBody, type RunWeekBody,
} from '../../shared/run';
import { runCard } from './card';
import { RUN_REGION, runComplaintMode, type ComplaintMode } from './complaints';
import { garminRuns, type Run } from './garmin-runs';
import { checkRunWeek } from './guardrails';
import { RESTART_DAYS } from './limits';
import { bandFor, capFor, easyPaceAt, maxHrOf, runNumbers, suggestedDays } from './numbers';
import { buildRunPrompt, RUN_SYSTEM_PROMPT, runAnswerJsonSchema } from './prompt';
import { phaseOf, ruleWeek, weekDates, type RuleWeek } from './rules';
import { manualRuns, mergeRuns } from './runs';
import { loadRunCache, saveRunCache, type RunCache } from './state';

const DAY = 86_400_000;
const RETRY_MS = 10 * 60_000;
const MAX_ATTEMPTS = 3;
/** One window for every Garmin read: the pace cache is pruned by it, so it must never change between calls. */
const WINDOW_DAYS = 120;
/** Runs in the last 8 weeks suggest switching running on. */
const SUGGEST_DAYS = 56;
/** The card shows the newest run of the last week. */
const CARD_DAYS = 7;
/** On Sunday from this hour the coming week is planned. */
const ANNOUNCE_HOUR = 18;

type Ask = (input: { prompt: string; systemPrompt: string; schema: object }) => Promise<unknown>;
export type RunDeps = {
  dir: string; store: RecordStore; nowMs: () => number; ask: Ask; noOpenRide: () => boolean;
  profile: (id: string) => Profile | null;
  garminDb: (id: string) => Pick<GarminDb, 'runs' | 'activityFile' | 'body'> | null;
  days: (id: string, dates: string[]) => Record<string, DayRating>;
  weeks: (id: string) => TrainingWeek[];
  complaints: (id: string) => Complaint[];
  sleepS?: (id: string, date: string) => number | null;
  garmin: (id: string) => { connected: boolean; capable: boolean };
  /** Records were written for this profile. */
  onExport?: (id: string) => void;
};

type Own = { rec: TrackedRecord; body: RunBody };
type Target = { week: string; fromDate: string; announce: boolean };
type Ctx = {
  id: string; now: number; today: string; runs: Run[]; settings: RunSettingsBody; settingsMs: number; weekdays: number[];
  maxHr: number | null; mode: ComplaintMode; complaints: Complaint[]; weeks: Map<string, RunWeekBody>;
};

const startMsOf = (date: string): number => { const d = dateOf(date, 0); d.setHours(0, 0, 0, 0); return d.getTime(); };
const shift = (date: string, n: number): string => dateKey(dateOf(date, n));
const dateOfMs = (ms: number): string => dateKey(new Date(ms));
const round1 = (x: number): number => Math.round(x * 10) / 10;
/** A body as compared for a rewrite: the time it was made does not count. */
const sameBody = (a: unknown, b: unknown): boolean => JSON.stringify({ ...(a as object), atMs: 0 }) === JSON.stringify({ ...(b as object), atMs: 0 });

/**
 * The run coach. It reads runs (Garmin and manual), writes the profile's `status`, `week-*` and `review-*` records, and
 * asks Claude only within the guardrails. Runs with no ride open only; without settings and without Garmin it writes nothing.
 */
export class RunCoach {
  private caches = new Map<string, RunCache>();
  private running = new Map<string, Promise<void>>();
  private lastRuns = new Map<string, Run[]>();

  constructor(private deps: RunDeps) {}

  isThinking(id: string): boolean { return this.running.has(id); }
  /** The runs of the last tick, only while running is on. For mobility after a run. */
  runs(id: string): Run[] { return this.lastRuns.get(id) ?? []; }

  tick(id: string): Promise<void> {
    const active = this.running.get(id);
    if (active) return active;
    const run: Promise<void> = this.plan(id).finally(() => { if (this.running.get(id) === run) this.running.delete(id); });
    this.running.set(id, run);
    return run;
  }

  private cache(id: string): RunCache {
    let c = this.caches.get(id);
    if (!c) { c = loadRunCache(this.deps.dir, id); this.caches.set(id, c); }
    return c;
  }
  private saveCache(id: string): void { saveRunCache(this.deps.dir, this.cache(id)); }

  /** Run records whose id and body type agree; anything else is ignored. */
  private own(id: string): Map<string, Own> {
    const out = new Map<string, Own>();
    for (const rec of this.deps.store.all(id, 'run')) {
      if (rec.deleted) continue;
      const body = readRunBody(rec.body);
      if (body && runIdType(rec.id) === body.type) out.set(rec.id, { rec, body });
    }
    return out;
  }
  private stored(id: string, recId: string): TrackedRecord | undefined {
    return this.deps.store.all(id, 'run').find((r) => r.id === recId);
  }
  private put(id: string, records: TrackedRecord[]): void {
    if (records.length === 0) return;
    this.deps.store.putMany(id, records);
    try { this.deps.onExport?.(id); } catch { /* a listener never stops the coach */ }
  }
  /** Written only when the body changed, always newer than the stored version. */
  private write(id: string, recId: string, body: RunBody | null, now: number): void {
    const old = this.stored(id, recId);
    if (body === null ? !old || old.deleted : old && !old.deleted && sameBody(old.body, body)) return;
    this.put(id, [{ kind: 'run', id: recId, updatedMs: Math.max(now, (old?.updatedMs ?? 0) + 1), deleted: body === null, body }]);
  }

  private async plan(id: string): Promise<void> {
    if (!this.deps.noOpenRide()) return;
    const profile = this.deps.profile(id);
    if (!profile) return;
    const now = this.deps.nowMs();
    const own = this.own(id);
    const settingsOwn = own.get(RUN_SETTINGS_ID);
    const settings = settingsOwn?.body.type === 'settings' ? settingsOwn.body : null;
    const db = this.deps.garminDb(id);
    if (!settings && !db) {
      this.lastRuns.delete(id);
      this.write(id, RUN_STATUS_ID, null, now);
      return;
    }
    const cache = this.cache(id);
    const on = settings?.on === true;
    if (on && cache.onSinceMs === null) cache.onSinceMs = Math.min(now, settingsOwn!.rec.updatedMs);
    if (!on) cache.onSinceMs = null;

    // One read for the highest heart rate, then the runs with the band it gives.
    const fromMs = now - WINDOW_DAYS * DAY;
    const seen = db ? [db.body()?.maxHrSeen ?? null, ...db.runs(fromMs).map((r) => r.maxHr)].filter((x): x is number => x !== null && Number.isFinite(x)) : [];
    const maxHr = maxHrOf(seen.length > 0 ? Math.max(...seen) : null, [], profile);
    const band = bandFor(maxHr);
    const fromGarmin = db ? garminRuns(db, fromMs, band, cache.paceCache) : [];
    const runs = mergeRuns(fromGarmin, manualRuns(this.deps.store.all(id, 'run'), band)).filter((r) => r.startMs <= now);
    this.saveCache(id);
    this.lastRuns.set(id, on ? runs : []);
    const complaints = this.deps.complaints(id);
    const mode = runComplaintMode(complaints, now);

    if (on && settings) {
      const weeks = new Map<string, RunWeekBody>();
      for (const [recId, o] of own) if (o.body.type === 'week' && recId === runWeekId(o.body.week)) weeks.set(o.body.week, o.body);
      const today = dateOfMs(now);
      const current = weekOf(now);
      const ctx: Ctx = {
        id, now, today, runs, settings, settingsMs: settingsOwn!.rec.updatedMs, weekdays: settings.weekdays ?? suggestedDays(runs, now),
        maxHr, mode, complaints, weeks,
      };
      // A run already done today keeps today as it is: the replan starts tomorrow.
      const ranToday = runs.some((r) => dateOfMs(r.startMs) === today);
      const targets: Target[] = [{ week: current, fromDate: ranToday ? shift(today, 1) : today, announce: false }];
      const d = new Date(now);
      if (dayIndex(now) === 6 && d.getHours() >= ANNOUNCE_HOUR) targets.push({ week: addWeeks(current, 1), fromDate: addWeeks(current, 1), announce: true });
      // The week before only gets its runs matched (a Sunday-night run is read on Monday).
      this.matchDone(ctx, addWeeks(current, -1));
      for (const t of targets) await this.planWeek(ctx, t);
      this.review(ctx, addWeeks(current, -1));
    }

    const recentGarmin = fromGarmin.some((r) => r.startMs > now - SUGGEST_DAYS * DAY && r.startMs <= now);
    const suggest = settings === null && recentGarmin;
    this.write(id, RUN_STATUS_ID, on || suggest ? this.status(id, on, suggest, settings, runs, maxHr, mode, now) : null, now);
  }

  private status(id: string, on: boolean, suggest: boolean, settings: RunSettingsBody | null, runs: Run[], maxHr: number | null, mode: ComplaintMode, now: number): RunStatusBody {
    const weeks = [...this.own(id).values()].flatMap((o) => (o.body.type === 'week' ? [o.body] : []));
    const newest = runs.filter((r) => r.startMs > now - CARD_DAYS * DAY).sort((a, b) => b.startMs - a.startMs)[0];
    let card: RunStatusBody['card'] = null;
    if (on && newest) {
      const date = dateOfMs(newest.startMs);
      const planned = weeks.flatMap((w) => w.runs).find((r) => r.date === date) ?? null;
      const before = shift(date, -1);
      card = runCard(newest, planned, {
        trendNow: easyPaceAt(runs.filter((r) => r.id !== newest.id), newest.startMs),
        dayBefore: this.deps.days(id, [before])[before] ?? null,
        sleepS: this.deps.sleepS?.(id, date) ?? null,
      });
    }
    const recent = runs.some((r) => r.startMs > now - SUGGEST_DAYS * DAY);
    return {
      type: 'status', atMs: now, on, suggest, needsAnswers: on && settings?.answers === null && !recent,
      suggestedDays: suggestedDays(runs, now), hrCap: capFor(maxHr), complaint: mode, numbers: runNumbers(runs, weeks, now), card,
    };
  }

  /** The id of the run on a date: the longest one that day. */
  private doneOn(runs: Run[], date: string): string | null {
    const onDay = runs.filter((r) => dateOfMs(r.startMs) === date).sort((a, b) => b.durationS - a.durationS);
    return onDay[0]?.id ?? null;
  }

  private matchDone(ctx: Ctx, week: string): void {
    const w = ctx.weeks.get(week);
    if (!w) return;
    const body: RunWeekBody = { ...w, runs: w.runs.map((r) => ({ ...r, done: this.doneOn(ctx.runs, r.date) })) };
    this.write(ctx.id, runWeekId(week), body, ctx.now);
    ctx.weeks.set(week, body);
  }

  private async planWeek(ctx: Ctx, t: Target): Promise<void> {
    const { id, now } = ctx;
    const cache = this.cache(id);
    const existing = ctx.weeks.get(t.week) ?? null;
    const missed = (existing?.runs ?? []).filter((r) => r.date < ctx.today && this.doneOn(ctx.runs, r.date) === null).map((r) => r.date);
    const key = JSON.stringify([ctx.settingsMs, ctx.weekdays, ctx.mode, missed, ctx.settings.answers]);
    if (existing && cache.planKey[t.week] === key) { this.matchDone(ctx, t.week); return; }

    const dates = Array.from({ length: 9 }, (_, i) => dateKey(dateOf(t.week, i - 1)));
    const days = this.deps.days(id, dates);
    const allowedDates = weekDates(t.week).filter((d, i) => ctx.weekdays.includes(i) && d >= t.fromDate);
    const rule = ruleWeek({
      nowMs: now, week: t.week, fromDate: t.fromDate, runs: ctx.runs, weekdays: ctx.weekdays, answers: ctx.settings.answers, maxHr: ctx.maxHr,
      complaint: ctx.mode, days, crossCut: (m) => crossSportCut(this.deps.weeks(id), m),
      lastTestMs: this.lastTestMs(ctx, t.fromDate), phase: phaseOf(ctx.runs, this.complaintWeeks(ctx), now), restartSince: this.restartSince(ctx),
    });
    const save = (planned: PlannedRun[], source: 'rules' | 'claude', reason: string, note: string | null): void => {
      const body = this.weekBody(ctx, t, existing, rule, planned, source, reason, note);
      this.write(id, runWeekId(t.week), body, now);
      ctx.weeks.set(t.week, body);
    };
    const settle = (): void => { cache.planKey[t.week] = key; cache.attempts = 0; this.saveCache(id); };

    // The rule plan stands first, so a missing or slow Claude never leaves the week empty.
    save(rule.runs, 'rules', rule.reason, null);
    if (rule.runs.length === 0) { settle(); return; }
    if (cache.attempts >= MAX_ATTEMPTS) { settle(); return; }
    if (cache.attempts > 0 && cache.lastAttemptMs !== null && now - cache.lastAttemptMs < RETRY_MS) return;
    cache.attempts += 1;
    cache.lastAttemptMs = now;
    this.saveCache(id);

    const numbers = runNumbers(ctx.runs, [...ctx.weeks.values()], now);
    const ask = (rejection?: string) => this.deps.ask({
      prompt: buildRunPrompt({ rule, runs: ctx.runs, numbers, complaint: ctx.mode, days, nowMs: now, allowedDates, ...(rejection ? { rejection } : {}) }),
      systemPrompt: RUN_SYSTEM_PROMPT, schema: runAnswerJsonSchema,
    });
    try {
      let checked = checkRunWeek(await ask(), rule, allowedDates, days);
      if (!checked.ok) {
        // Exactly one second attempt with the reason; after that the rule plan stands.
        try { checked = checkRunWeek(await ask(checked.reason), rule, allowedDates, days); } catch { /* the first answer decides */ }
      }
      if (checked.ok) save(checked.runs, 'claude', checked.reason, checked.note);
      cache.lastError = checked.ok ? null : 'invalid';
      settle();
    } catch (e) {
      cache.lastError = e instanceof ClaudeError ? e.kind : 'failed';
      this.saveCache(id);
    }
  }

  private weekBody(ctx: Ctx, t: Target, existing: RunWeekBody | null, rule: RuleWeek, planned: PlannedRun[], source: 'rules' | 'claude', reason: string, note: string | null): RunWeekBody {
    // Past dates stay as they were; only the open days take the new plan.
    const past = (existing?.runs ?? []).filter((r) => r.date < t.fromDate).map((r) => ({ ...r, done: this.doneOn(ctx.runs, r.date) }));
    const fresh = planned.filter((r) => r.date >= t.fromDate).map((r) => ({ ...r, fp: runFp(r), done: this.doneOn(ctx.runs, r.date) }));
    const runs = [...past, ...fresh].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return {
      type: 'week', week: t.week, announce: existing?.announce ?? t.announce, atMs: ctx.now, phase: rule.phase, source, reason, note, runs,
      garmin: this.garminAfter(existing?.garmin ?? null, runs),
    };
  }

  /** A run already sent whose plan changed needs a new confirmation: nothing is sent, the week says so. */
  private garminAfter(g: RunGarmin | null, runs: { date: string; fp: string }[]): RunGarmin | null {
    if (!g) return null;
    const changed = Object.entries(g.sent).some(([date, s]) => runs.find((r) => r.date === date)?.fp !== s.fp);
    return changed ? { ...g, status: 'changed' } : g;
  }

  /** The later of the last planned test date before `fromDate` (done or skipped) and the switch-on time. */
  private lastTestMs(ctx: Ctx, fromDate: string): number | null {
    const tests = [...ctx.weeks.values()].flatMap((w) => w.runs).filter((r) => r.kind === 'test' && r.date < fromDate).map((r) => startMsOf(r.date));
    const all = [...tests, ...(this.cache(ctx.id).onSinceMs !== null ? [this.cache(ctx.id).onSinceMs!] : [])];
    return all.length > 0 ? Math.max(...all) : null;
  }

  /** The local date the newest run complaint closed, while the mode still says restart. */
  private restartSince(ctx: Ctx): string | null {
    if (ctx.mode !== 'restart') return null;
    const closed = ctx.complaints.filter((c) => c.status === 'over' && RUN_REGION.test(c.text) && ctx.now - c.updatedMs < RESTART_DAYS * DAY);
    return closed.length > 0 ? dateOfMs(Math.max(...closed.map((c) => c.updatedMs))) : null;
  }

  /** Weeks with a run complaint: an active one up to now, an older one up to its last change. */
  private complaintWeeks(ctx: Ctx): Set<string> {
    const out = new Set<string>();
    for (const c of ctx.complaints) {
      if (!RUN_REGION.test(c.text)) continue;
      const end = c.status === 'active' ? ctx.now : c.updatedMs;
      for (let w = weekOf(c.startedMs); w <= weekOf(end); w = addWeeks(w, 1)) out.add(w);
    }
    return out;
  }

  /** Once per past week that had a plan: what happened, and the focus of the coming week. */
  private review(ctx: Ctx, week: string): void {
    const cache = this.cache(ctx.id);
    const plan = ctx.weeks.get(week);
    if (!plan || cache.reviewed.includes(week)) return;
    const recId = runReviewId(week);
    if (!this.stored(ctx.id, recId)) {
      const endMs = startMsOf(addWeeks(week, 1)) - 1;
      const inWeek = ctx.runs.filter((r) => weekOf(r.startMs) === week);
      const longest = inWeek.filter((r) => r.distanceM !== null).map((r) => r.distanceM!);
      const pace = easyPaceAt(ctx.runs, endMs);
      const test = plan.runs.find((r) => r.kind === 'test' && r.done !== null);
      const testRun = test ? inWeek.find((r) => r.id === test.done) : undefined;
      const body: RunReviewBody = {
        type: 'review', week, atMs: ctx.now,
        km: round1(inWeek.reduce((a, r) => a + (r.distanceM ?? 0), 0) / 1000),
        minutes: Math.round(inWeek.reduce((a, r) => a + r.durationS, 0) / 60),
        plannedMinutes: plan.runs.reduce((a, r) => a + r.minutes, 0),
        runs: inWeek.length,
        longestKm: longest.length > 0 ? round1(Math.max(...longest) / 1000) : null,
        easyPace: pace === null ? null : { now: pace, weeks4: easyPaceAt(ctx.runs, endMs - 28 * DAY) },
        testM: testRun?.best30M ?? null,
        focus: focusText(ctx.mode, phaseOf(ctx.runs, this.complaintWeeks(ctx), ctx.now).phase),
      };
      this.write(ctx.id, recId, body, ctx.now);
    }
    cache.reviewed = [...cache.reviewed, week].slice(-20);
    this.saveCache(ctx.id);
  }
}

/** The coming week's focus, calm and without pressure. */
export const focusText = (mode: ComplaintMode, phase: 1 | 2): string => {
  if (mode === 'pause') return 'Nächste Woche ruht das Laufen. Sobald es wieder passt, geht es sanft weiter.';
  if (mode !== null) return 'Nächste Woche bleibt der Plan sanft, mit halber Zeit.';
  if (phase === 1) return 'Nächste Woche: ruhige Läufe, die Zeit auf den Beinen wächst behutsam.';
  return 'Nächste Woche: Der lange Lauf wächst Schritt für Schritt, die anderen Läufe bleiben ruhig.';
};

import fs from 'node:fs';
import path from 'node:path';
import {
  addWeeks, dayIndex, DEFAULT_MEAL_SETTINGS, DIETS, EMPTY_STATE, HABITS, isWeekKey, mealKey, mergeStates, planRecordId, readMealState,
  SLOTS, stateRecordId, weekOf, weekOfRecordId, withEater, withItem, type Diet, type Habit, type ItemState, type Meal, type MealPlan,
  type MealSettings, type MealState, type Person, type Slot,
} from '../../shared/meals';
import type { TrackedRecord } from '../../shared/records';
import type { RecordStore } from '../tracking/store';
import { fitsEveryone } from './check';
import { buildMealPrompt, buildSwapPrompt, dishFrom, MEAL_SYSTEM_PROMPT, mealAnswerJsonSchema, mealAnswerSchema, mealsFromAnswer } from './prompt';
import { constraintsFor, dishOf, pickRecipe, ruleMeals, seeded, skeleton, type Member, type Slotted } from './rules';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The plan for the coming week is made on Saturday from 06:00, or on Sunday if the Mac was off. */
const PLAN_DAY = 5;
const PLAN_HOUR = 6;
const PLAN_TIMEOUT_MS = 300_000;
const SWAP_TIMEOUT_MS = 120_000;
const MAX_TAGS = 20;
const TAG_MAX = 40;
const TRAINING_WINDOW_DAYS = 28;
const TRAINING_MIN_SESSIONS = 2;

export const NOTICE_NO_AI = 'Der Coach war gerade nicht erreichbar. Der Plan kommt aus Pandafits Rezeptliste.';
const noticeReplaced = (n: number) => (n === 1 ? 'Ein Gericht vom Coach passte nicht zu allen Angaben und kommt aus der Rezeptliste.' : `${n} Gerichte vom Coach passten nicht zu allen Angaben und kommen aus der Rezeptliste.`);

type Ask = (input: { prompt: string; systemPrompt: string; schema: object; timeoutMs?: number }) => Promise<unknown>;
type Deps = {
  dir: string; nowMs: () => number;
  /** Every profile on this Mac, with the name and avatar the plan shows. */
  profiles: () => Person[];
  /** False while a ride is open: then nothing is planned and no AI is asked. */
  noOpenRide: () => boolean;
  ask?: Ask;
  /** Weekdays (Monday 0) the person usually trains on. */
  trainingDays?: (id: string) => number[];
  /** The tracked records of this Mac and whether a profile is linked to an account. Without them nothing is synced. */
  store?: Pick<RecordStore, 'all' | 'putMany'>;
  linked?: (id: string) => boolean;
  random?: () => number;
};
type FileData = { settings: Record<string, MealSettings>; plans: Record<string, MealPlan>; states: Record<string, MealState>; notices: Record<string, string | null>; lastAuto: string | null };

export type MealWeek = { plan: MealPlan; state: MealState; notice: string | null };
export type MealsView = {
  settings: MealSettings;
  /** The current week, then the next one if it is planned already. */
  weeks: MealWeek[];
  currentWeek: string; today: number;
  /** A week or a meal key being planned right now. */
  planning: string | null;
  /** False while a ride is open. */
  canPlan: boolean;
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const tags = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((t): t is string => typeof t === 'string').map((t) => t.trim().replace(/\s+/g, ' ').slice(0, TAG_MAX)).filter(Boolean))].slice(0, MAX_TAGS) : []);

/** Settings as sent by the app, cut to the known shape. Anything unknown takes the default. */
export function cleanSettings(x: unknown): MealSettings {
  const d = DEFAULT_MEAL_SETTINGS;
  if (!isObj(x)) return { ...d, habits: { ...d.habits } };
  const h = isObj(x.habits) ? x.habits : {};
  const habits = Object.fromEntries(SLOTS.map((s) => [s, HABITS.includes(h[s] as Habit) ? h[s] : d.habits[s]])) as Record<Slot, Habit>;
  return { on: x.on === true, diet: DIETS.includes(x.diet as Diet) ? x.diet as Diet : d.diet, dislikes: tags(x.dislikes), intolerances: tags(x.intolerances), habits };
}

/** Weekdays with at least two sessions in the last four weeks. */
export function usualTrainingDays(startsMs: number[], nowMs: number): number[] {
  const count = new Array(7).fill(0) as number[];
  for (const t of startsMs) if (t <= nowMs && nowMs - t <= TRAINING_WINDOW_DAYS * DAY) count[dayIndex(t)]!++;
  return count.flatMap((n, d) => (n >= TRAINING_MIN_SESSIONS ? [d] : []));
}

/**
 * The household's meal plan: one per Mac, for every profile that turned it on. Plans on Saturday morning for the coming
 * week, with the AI when it is there and from the own recipe list otherwise. Never with a ride open. A profile with the
 * plan off is not read, not asked about and not synced.
 */
export class MealCoach {
  private data: FileData | null = null;
  private planning: string | null = null;
  constructor(private deps: Deps) {}

  private file(): string { return path.join(this.deps.dir, 'household.json'); }
  private load(): FileData {
    if (this.data) return this.data;
    let d: Partial<FileData> = {};
    try { const parsed = JSON.parse(fs.readFileSync(this.file(), 'utf8')) as unknown; if (isObj(parsed)) d = parsed as Partial<FileData>; } catch { /* no file yet */ }
    this.data = { settings: isObj(d.settings) ? d.settings : {}, plans: isObj(d.plans) ? d.plans : {}, states: isObj(d.states) ? d.states : {}, notices: isObj(d.notices) ? d.notices : {}, lastAuto: typeof d.lastAuto === 'string' ? d.lastAuto : null };
    return this.data;
  }
  private save(): void {
    const d = this.load();
    const now = this.deps.nowMs();
    // Only the last, this and the next week are kept.
    const keep = new Set([addWeeks(weekOf(now), -1), weekOf(now), addWeeks(weekOf(now), 1)]);
    for (const k of Object.keys(d.plans)) if (!keep.has(k)) { delete d.plans[k]; delete d.states[k]; delete d.notices[k]; }
    fs.mkdirSync(this.deps.dir, { recursive: true });
    const f = this.file();
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(d));
    fs.renameSync(`${f}.tmp`, f);
  }

  settings(id: string): MealSettings { return cleanSettings(this.load().settings[id]); }
  enabled(id: string): boolean { return this.settings(id).on; }
  isPlanning(): boolean { return this.planning !== null; }

  private members(): Member[] {
    return this.deps.profiles().filter((p) => this.enabled(p.id)).map((p) => ({ id: p.id, settings: this.settings(p.id) }));
  }
  private people(): Person[] { return this.deps.profiles().filter((p) => this.enabled(p.id)).map(({ id, name, avatar }) => ({ id, name, ...(avatar ? { avatar } : {}) })); }

  setSettings(id: string, raw: unknown): void {
    if (!this.deps.profiles().some((p) => p.id === id)) return;
    const d = this.load();
    const next = cleanSettings(raw);
    const was = this.settings(id).on;
    d.settings[id] = next;
    for (const plan of Object.values(d.plans)) {
      const inPlan = plan.people.some((p) => p.id === id);
      // Off: out of every plan, so portions and the shopping list shrink. On: in the plan, eating once switched on.
      if (!next.on && inPlan) { plan.people = plan.people.filter((p) => p.id !== id); for (const m of plan.meals) m.eaters = m.eaters.filter((e) => e !== id); }
      if (next.on && !was && !inPlan) { const p = this.deps.profiles().find((x) => x.id === id); if (p) plan.people.push({ id: p.id, name: p.name, ...(p.avatar ? { avatar: p.avatar } : {}) }); }
    }
    this.save();
    this.exportAll();
  }

  view(id: string): MealsView {
    const now = this.deps.nowMs();
    const d = this.load();
    const current = weekOf(now);
    const weeks = [current, addWeeks(current, 1)].flatMap((w) => (d.plans[w] ? [{ plan: d.plans[w]!, state: d.states[w] ?? EMPTY_STATE, notice: d.notices[w] ?? null }] : []));
    return { settings: this.settings(id), weeks: this.enabled(id) ? weeks : [], currentWeek: current, today: dayIndex(now), planning: this.planning, canPlan: this.deps.noOpenRide() };
  }

  /** From the scan loop. Never throws into it, never plans with a ride open, and does nothing at all with no one in. */
  async tick(): Promise<string[]> {
    try {
      // No profile ever turned the plan on: nothing is read, written or sent.
      if (Object.keys(this.load().settings).length === 0) return [];
      if (this.members().length === 0) return this.exportAll();
      this.importStates();
      const touched = this.exportAll();
      const now = this.deps.nowMs();
      const day = dayIndex(now);
      const due = (day === PLAN_DAY && new Date(now).getHours() >= PLAN_HOUR) || day === PLAN_DAY + 1;
      const target = addWeeks(weekOf(now), 1);
      const d = this.load();
      if (due && !d.plans[target] && d.lastAuto !== target && this.deps.noOpenRide() && !this.planning) {
        d.lastAuto = target;
        this.save();
        await this.planWeek(target, 0);
        return [...new Set([...touched, ...this.exportAll()])];
      }
      return touched;
    } catch { return []; }
  }

  /** "Neu planen": the shown week, from today on for the current one. */
  async replan(id: string, week: string): Promise<void> {
    const now = this.deps.nowMs();
    const current = weekOf(now);
    if (!this.enabled(id) || !this.deps.noOpenRide() || this.planning || (week !== current && week !== addWeeks(current, 1))) return;
    await this.planWeek(week, week === current ? dayIndex(now) : 0);
    this.exportAll();
  }

  private training(): number[] {
    return [...new Set(this.members().flatMap((m) => { try { return this.deps.trainingDays?.(m.id) ?? []; } catch { return []; } }))].sort();
  }

  private async planWeek(week: string, fromDay: number): Promise<void> {
    const members = this.members();
    if (members.length === 0) return;
    this.planning = week;
    try {
      const d = this.load();
      const trainingDays = this.training();
      const aiSlots = skeleton(members, fromDay, false);
      let fromAi: Meal[] = [];
      let notice: string | null = null;
      if (this.deps.ask) {
        try {
          const lastWeek = (d.plans[addWeeks(week, -1)]?.meals ?? []).map((m) => m.dish.title);
          const raw = await this.deps.ask({ prompt: buildMealPrompt({ members, slots: aiSlots, trainingDays, lastWeek: [...new Set(lastWeek)] }), systemPrompt: MEAL_SYSTEM_PROMPT, schema: mealAnswerJsonSchema, timeoutMs: PLAN_TIMEOUT_MS });
          fromAi = mealsFromAnswer(raw, members, aiSlots);
          const replaced = aiSlots.length - fromAi.length;
          if (!mealAnswerSchema.safeParse(raw).success) notice = NOTICE_NO_AI;
          else if (replaced > 0) notice = noticeReplaced(replaced);
        } catch { notice = NOTICE_NO_AI; }
      } else notice = NOTICE_NO_AI;
      // Whatever the AI left open comes from the list, with the rule's cook-once-eat-twice where both halves are open.
      const have = new Set(fromAi.map((m) => mealKey(m.day, m.slot)));
      const open = skeleton(members, fromDay, true).filter((s) => !have.has(mealKey(s.day, s.slot))).map((s) => (s.reuseOf && have.has(s.reuseOf) ? { ...s, reuseOf: null } : s));
      const random = this.deps.random ?? seeded(`${week}-${fromDay}-${this.deps.nowMs()}`);
      const lastIds = new Set((d.plans[addWeeks(week, -1)]?.meals ?? []).flatMap((m) => (m.dish.recipeId ? [m.dish.recipeId] : [])));
      const fromList = ruleMeals(members, open, trainingDays, random, lastIds);
      const kept = (d.plans[week]?.meals ?? []).filter((m) => m.day < fromDay);
      const meals = [...kept, ...fromAi, ...fromList].sort((a, b) => a.day - b.day || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
      const source = fromAi.length === 0 ? 'liste' : fromList.length === 0 ? 'coach' : 'gemischt';
      d.plans[week] = { week, createdMs: this.deps.nowMs(), source, people: this.people(), meals, trainingDays };
      d.notices[week] = notice;
      this.save();
    } finally { this.planning = null; }
  }

  /** "Tauschen": another fitting dish for one meal, from the list at once or, with `ai`, from the AI when it answers. */
  async swap(id: string, week: string, key: string, ai: boolean): Promise<void> {
    if (!this.enabled(id) || !this.deps.noOpenRide() || this.planning) return;
    const d = this.load();
    const plan = d.plans[week];
    const meal = plan?.meals.find((m) => mealKey(m.day, m.slot) === key);
    if (!plan || !meal) return;
    const members = this.members();
    const state = d.states[week] ?? EMPTY_STATE;
    const eatersNow = (k: string) => { const m = plan.meals.find((x) => mealKey(x.day, x.slot) === k); const over = state.eaters[k] ?? {}; return m ? plan.people.map((p) => p.id).filter((p) => (over[p] ? over[p]!.on : m.eaters.includes(p))) : []; };
    const slot: Slotted = { day: meal.day, slot: meal.slot, eaters: eatersNow(key), takeAlong: meal.takeAlong, reuseOf: null };
    const reuses = plan.meals.filter((m) => m.reuseOf === key);
    const who = constraintsFor(members, [...new Set([...slot.eaters, ...reuses.flatMap((r) => eatersNow(mealKey(r.day, r.slot)))])]);
    const random = this.deps.random ?? Math.random;
    let dish = null;
    if (ai && this.deps.ask) {
      this.planning = key;
      try {
        const avoid = [...new Set(plan.meals.map((m) => m.dish.title))];
        const raw = await this.deps.ask({ prompt: buildSwapPrompt({ members, slot, training: plan.trainingDays.includes(meal.day), avoid }), systemPrompt: MEAL_SYSTEM_PROMPT, schema: mealAnswerJsonSchema, timeoutMs: SWAP_TIMEOUT_MS });
        const parsed = mealAnswerSchema.safeParse(raw);
        const a = parsed.success ? parsed.data.mahlzeiten[0] : undefined;
        const got = a ? dishFrom(a) : null;
        if (got && !avoid.includes(got.title) && fitsEveryone(got, who.map((m) => m.settings))) dish = got;
      } catch { /* the list takes over */ } finally { this.planning = null; }
    }
    if (!dish) {
      const used = new Set(plan.meals.flatMap((m) => (m.dish.recipeId ? [m.dish.recipeId] : [])));
      const keepDays = Math.max(0, ...reuses.map((r) => r.day - meal.day));
      const r = pickRecipe({ slot: meal.slot, eaters: who, takeAlong: meal.takeAlong, training: plan.trainingDays.includes(meal.day), keepDays, used, not: meal.dish.recipeId, random })
        ?? pickRecipe({ slot: meal.slot, eaters: constraintsFor(members, slot.eaters), takeAlong: meal.takeAlong, training: false, keepDays: 0, used, not: meal.dish.recipeId, random });
      if (!r) return;
      dish = dishOf(r);
    }
    // Re-read: the plan may have changed while the AI thought.
    const fresh = this.load().plans[week];
    const target = fresh?.meals.find((m) => mealKey(m.day, m.slot) === key);
    if (!fresh || !target || target.dish.title !== meal.dish.title) return;
    target.dish = dish; target.reuseOf = null;
    for (const r of fresh.meals.filter((m) => m.reuseOf === key)) {
      if (r.day - target.day <= dish.keepsDays && fitsEveryone(dish, constraintsFor(members, eatersNow(mealKey(r.day, r.slot))).map((m) => m.settings))) r.dish = dish;
      else {
        const own = pickRecipe({ slot: r.slot, eaters: constraintsFor(members, eatersNow(mealKey(r.day, r.slot))), takeAlong: r.takeAlong, training: false, keepDays: 0, used: new Set([dish.recipeId ?? '']), random });
        if (own) { r.dish = dishOf(own); r.reuseOf = null; }
      }
    }
    this.save();
    this.exportAll();
  }

  setEater(id: string, week: string, key: string, person: string, on: boolean): void {
    const d = this.load();
    const plan = d.plans[week];
    if (!this.enabled(id) || !plan || !plan.meals.some((m) => mealKey(m.day, m.slot) === key) || !plan.people.some((p) => p.id === person)) return;
    d.states[week] = withEater(d.states[week] ?? EMPTY_STATE, key, person, on, this.deps.nowMs());
    this.save();
    this.exportAll();
  }

  setItem(id: string, week: string, item: string, state: ItemState): void {
    const d = this.load();
    if (!this.enabled(id) || !d.plans[week] || typeof item !== 'string' || item.length > 120 || !['offen', 'gekauft', 'da'].includes(state)) return;
    d.states[week] = withItem(d.states[week] ?? EMPTY_STATE, item, state, this.deps.nowMs());
    this.save();
    this.exportAll();
  }

  // ---- Sync through the accounts: only for profiles with the plan on and a linked account ----

  private synced(id: string): boolean {
    try { return !!this.deps.store && this.enabled(id) && (this.deps.linked?.(id) ?? false); } catch { return false; }
  }

  /** Changes from phones (shopping ticks, who eats) into the household's state, entry by entry. */
  private importStates(): void {
    const { store } = this.deps;
    if (!store) return;
    const d = this.load();
    let changed = false;
    for (const p of this.deps.profiles()) {
      if (!this.synced(p.id)) continue;
      for (const r of store.all(p.id, 'mealplan')) {
        const w = weekOfRecordId(r.id);
        if (!w || w.part !== 'state' || r.deleted || !d.plans[w.week]) continue;
        const before = d.states[w.week] ?? EMPTY_STATE;
        const merged = mergeStates(before, readMealState(r.body));
        if (JSON.stringify(merged) !== JSON.stringify(before)) { d.states[w.week] = merged; changed = true; }
      }
    }
    if (changed) this.save();
  }

  /** Writes the plan and its state into each synced profile's records, and tombstones what is no longer wanted. Returns the profiles it changed. */
  exportAll(): string[] {
    const { store } = this.deps;
    if (!store) return [];
    const touched: string[] = [];
    const now = this.deps.nowMs();
    const d = this.load();
    const current = weekOf(now);
    const weeks = [current, addWeeks(current, 1)].filter((w) => d.plans[w]);
    for (const p of this.deps.profiles()) {
      try {
        const have = store.all(p.id, 'mealplan');
        // Never on and nothing there: no read beyond this, no write, nothing to send.
        if (!this.synced(p.id) && !have.some((r) => !r.deleted)) continue;
        const wanted = new Map<string, unknown>();
        if (this.synced(p.id)) {
          for (const w of weeks) {
            wanted.set(planRecordId(w), { ...d.plans[w], you: p.id });
            wanted.set(stateRecordId(w), d.states[w] ?? EMPTY_STATE);
          }
        }
        const out: TrackedRecord[] = [];
        for (const [rid, body] of wanted) {
          const r = have.find((x) => x.id === rid);
          if (r && !r.deleted && JSON.stringify(r.body) === JSON.stringify(body)) continue;
          out.push({ kind: 'mealplan', id: rid, updatedMs: Math.max(now, (r?.updatedMs ?? 0) + 1), deleted: false, body });
        }
        for (const r of have) if (!r.deleted && !wanted.has(r.id)) out.push({ ...r, updatedMs: Math.max(now, r.updatedMs + 1), deleted: true });
        if (out.length > 0) { store.putMany(p.id, out); touched.push(p.id); }
      } catch { /* the next tick tries again */ }
    }
    return touched;
  }
}

export const isMealWeek = isWeekKey;

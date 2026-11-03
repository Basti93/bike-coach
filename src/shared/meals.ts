/**
 * The household's weekly meal plan: types, week arithmetic, portions and the shopping list. Pure code, shared by the coach,
 * the Mac app and the phone. No calories, no weight: protein is one rough number per portion.
 */

export const SLOTS = ['fruehstueck', 'mittag', 'abend'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = { fruehstueck: 'Frühstück', mittag: 'Mittagessen', abend: 'Abendessen' };
export const SLOT_TIME: Record<Slot, string> = { fruehstueck: '8:00', mittag: '13:00', abend: '19:00' };
export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
export const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;

export type Diet = 'vegetarisch' | 'vegan' | 'alles';
export const DIETS: readonly Diet[] = ['vegetarisch', 'vegan', 'alles'];
/** Where a person usually has a meal on a workday. At the weekend every meal is at home. */
export type Habit = 'zuhause' | 'mitnehmen' | 'auswaerts';
export const HABITS: readonly Habit[] = ['zuhause', 'mitnehmen', 'auswaerts'];
export type MealSettings = { on: boolean; diet: Diet; dislikes: string[]; intolerances: string[]; habits: Record<Slot, Habit> };
export const DEFAULT_MEAL_SETTINGS: MealSettings = { on: false, diet: 'vegetarisch', dislikes: [], intolerances: [], habits: { fruehstueck: 'zuhause', mittag: 'mitnehmen', abend: 'zuhause' } };

export const SECTIONS = ['Obst und Gemüse', 'Kühlregal', 'Brot und Backwaren', 'Vorrat', 'Tiefkühl', 'Sonstiges'] as const;
export type Section = (typeof SECTIONS)[number];
export const UNITS = ['g', 'ml', 'Stk', 'EL', 'TL', 'Prise', 'Bund', 'Dose', 'Zehe', 'Scheibe'] as const;
export type Unit = (typeof UNITS)[number];

/** Amounts are per portion. `raw`: eaten raw, so a dislike like "rohe Zwiebeln" applies. */
export type Ingredient = { name: string; amount: number; unit: Unit; section: Section; raw?: boolean };
export type Dish = { title: string; ingredients: Ingredient[]; steps: string[]; minutes: number; proteinG: number; keepsDays: number; source: 'coach' | 'liste'; recipeId?: string };
/** `reuseOf` names the meal this one is the rest of (cook once, eat twice): it has nothing of its own to shop or cook. */
export type Meal = { day: number; slot: Slot; dish: Dish; reuseOf: string | null; eaters: string[]; takeAlong: boolean };
export type Person = { id: string; name: string; avatar?: string };
export type MealPlan = { week: string; createdMs: number; source: 'coach' | 'liste' | 'gemischt'; people: Person[]; meals: Meal[]; trainingDays: number[] };
export type ItemState = 'offen' | 'gekauft' | 'da';
/** Changes on top of the plan, each with its own time, so two devices merge entry by entry. */
export type MealState = {
  eaters: Record<string, Record<string, { on: boolean; atMs: number }>>;
  items: Record<string, { state: ItemState; atMs: number }>;
};
export const EMPTY_STATE: MealState = { eaters: {}, items: {} };

export const mealKey = (day: number, slot: Slot): string => `${day}-${slot}`;
export const parseMealKey = (key: string): { day: number; slot: Slot } | null => {
  const m = /^([0-6])-(fruehstueck|mittag|abend)$/.exec(key);
  return m ? { day: Number(m[1]), slot: m[2] as Slot } : null;
};

// ---- Weeks, in local time ----

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Monday 0 … Sunday 6. */
export const dayIndex = (ms: number): number => (new Date(ms).getDay() + 6) % 7;
/** The Monday of the week `ms` lies in, as YYYY-MM-DD. */
export const weekOf = (ms: number): string => {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - dayIndex(ms));
  return dateKey(d);
};
export const dateOf = (week: string, day: number): Date => {
  const [y, m, d] = week.split('-').map(Number);
  return new Date(y!, m! - 1, d! + day, 12);
};
export const addWeeks = (week: string, n: number): string => dateKey(dateOf(week, 7 * n));
export const isWeekKey = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && dateKey(dateOf(x, 0)) === x && dateOf(x, 0).getDay() === 1;
export const dayDate = (week: string, day: number): string => { const d = dateOf(week, day); return `${d.getDate()}.${d.getMonth() + 1}.`; };
export const weekRangeText = (week: string): string => `${dayDate(week, 0)} bis ${dayDate(week, 6)}`;

// ---- Who eats, how much is cooked ----

export function eatersOf(plan: MealPlan, state: MealState, key: string): string[] {
  const meal = plan.meals.find((m) => mealKey(m.day, m.slot) === key);
  if (!meal) return [];
  const over = state.eaters[key] ?? {};
  return plan.people.map((p) => p.id).filter((id) => (over[id] ? over[id]!.on : meal.eaters.includes(id)));
}

/** The meals that eat the rest of `key`. */
export const reusesOf = (plan: MealPlan, key: string): Meal[] => plan.meals.filter((m) => m.reuseOf === key);

/** Portions to cook for a meal: its own eaters and those of every meal that eats its rest. A rest itself cooks nothing. */
export function cookPortions(plan: MealPlan, state: MealState, key: string): { total: number; parts: { day: number; slot: Slot; count: number }[] } {
  const meal = plan.meals.find((m) => mealKey(m.day, m.slot) === key);
  if (!meal || meal.reuseOf) return { total: 0, parts: [] };
  const parts = [meal, ...reusesOf(plan, key)].map((m) => ({ day: m.day, slot: m.slot, count: eatersOf(plan, state, mealKey(m.day, m.slot)).length }));
  return { total: parts.reduce((a, p) => a + p.count, 0), parts };
}

export const withEater = (state: MealState, key: string, person: string, on: boolean, atMs: number): MealState =>
  ({ ...state, eaters: { ...state.eaters, [key]: { ...(state.eaters[key] ?? {}), [person]: { on, atMs } } } });
export const withItem = (state: MealState, item: string, s: ItemState, atMs: number): MealState =>
  ({ ...state, items: { ...state.items, [item]: { state: s, atMs } } });

/** Entry by entry, the newer one wins; a tie goes to the greater JSON text so every device ends the same. */
export function mergeStates(a: MealState, b: MealState): MealState {
  const pick = <T extends { atMs: number }>(x: T | undefined, y: T | undefined): T | undefined => {
    if (!x) return y;
    if (!y) return x;
    if (x.atMs !== y.atMs) return x.atMs > y.atMs ? x : y;
    return JSON.stringify(x) >= JSON.stringify(y) ? x : y;
  };
  const eaters: MealState['eaters'] = {};
  for (const key of new Set([...Object.keys(a.eaters), ...Object.keys(b.eaters)])) {
    const ea = a.eaters[key] ?? {}, eb = b.eaters[key] ?? {};
    eaters[key] = {};
    for (const p of new Set([...Object.keys(ea), ...Object.keys(eb)])) eaters[key]![p] = pick(ea[p], eb[p])!;
  }
  const items: MealState['items'] = {};
  for (const k of new Set([...Object.keys(a.items), ...Object.keys(b.items)])) items[k] = pick(a.items[k], b.items[k])!;
  return { eaters, items };
}

// ---- Shopping list ----

const lower = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const PANTRY_UNITS: readonly Unit[] = ['EL', 'TL', 'Prise'];
type Family = 'g' | 'ml' | 'Stk' | 'Bund' | 'Dose' | 'Zehe' | 'Scheibe' | 'etwas';
const familyOf = (u: Unit): Family => (PANTRY_UNITS.includes(u) ? 'etwas' : (u as Family));
export const itemKey = (name: string, unit: Unit): string => `${lower(name)}|${familyOf(unit)}`;

/** Common pack sizes, so the list says what to take from the shelf. */
const PACKS: Record<string, { size: number; label: string }> = {
  magerquark: { size: 500, label: 'Becher' }, skyr: { size: 450, label: 'Becher' }, 'hüttenkäse': { size: 200, label: 'Becher' },
  naturjoghurt: { size: 500, label: 'Becher' }, 'griechischer joghurt': { size: 500, label: 'Becher' }, sojajoghurt: { size: 500, label: 'Becher' },
  'tofu natur': { size: 200, label: 'Packung' }, 'räuchertofu': { size: 200, label: 'Packung' }, feta: { size: 200, label: 'Packung' }, halloumi: { size: 225, label: 'Packung' },
  mozzarella: { size: 125, label: 'Packung' }, haferflocken: { size: 500, label: 'Packung' }, vollkornnudeln: { size: 500, label: 'Packung' },
  basmatireis: { size: 500, label: 'Packung' }, quinoa: { size: 400, label: 'Packung' }, bulgur: { size: 500, label: 'Packung' },
  'rote linsen': { size: 500, label: 'Packung' }, tellerlinsen: { size: 500, label: 'Packung' }, 'passierte tomaten': { size: 500, label: 'Packung' },
  milch: { size: 1000, label: 'Packung' }, hafermilch: { size: 1000, label: 'Packung' }, 'tk-beeren': { size: 300, label: 'Beutel' },
  'tk-erbsen': { size: 450, label: 'Beutel' }, babyspinat: { size: 125, label: 'Beutel' }, kartoffeln: { size: 1000, label: 'Beutel' },
  sojaschnetzel: { size: 150, label: 'Packung' }, hummus: { size: 200, label: 'Becher' }, 'tk-brokkoli': { size: 450, label: 'Beutel' },
};
const SLICES_PER_LOAF = 10;
const CLOVES_PER_BULB = 10;

const de = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const ceilTo = (n: number, step: number) => Math.ceil(n / step - 1e-9) * step;
const roundMass = (n: number, unit: 'g' | 'ml'): string => {
  if (n >= 1000) return `${de(ceilTo(n, 100) / 1000)} ${unit === 'g' ? 'kg' : 'l'}`;
  return `${n < 100 ? ceilTo(n, 10) : ceilTo(n, 50)} ${unit}`;
};

/** The amount to buy, rounded to what a shop sells. */
export function shopAmount(name: string, unit: Unit, amount: number): string {
  const fam = familyOf(unit);
  const pack = PACKS[lower(name)];
  if (fam === 'etwas') return 'aus dem Vorrat';
  if ((fam === 'g' || fam === 'ml') && pack) {
    const n = Math.max(1, Math.ceil(amount / pack.size - 1e-9));
    return `${n} ${pack.label} à ${pack.size >= 1000 ? `${de(pack.size / 1000)} ${fam === 'g' ? 'kg' : 'l'}` : `${pack.size} ${fam}`}`;
  }
  if (fam === 'g' || fam === 'ml') return roundMass(amount, fam);
  if (fam === 'Zehe') { const n = Math.max(1, Math.ceil(amount / CLOVES_PER_BULB - 1e-9)); return n === 1 ? '1 Knolle' : `${n} Knollen`; }
  if (fam === 'Scheibe') { const n = Math.max(1, Math.ceil(amount / SLICES_PER_LOAF - 1e-9)); return `${n} ${n === 1 ? 'Brot' : 'Brote'} (${Math.ceil(amount - 1e-9)} Scheiben)`; }
  const n = Math.max(1, Math.ceil(amount - 1e-9));
  if (fam === 'Dose') return `${n} ${n === 1 ? 'Dose' : 'Dosen'}`;
  if (fam === 'Bund') return `${n} Bund`;
  return `${n} Stück`;
}

/** An amount in a recipe for `portions` people, readable. */
export function recipeAmount(i: Ingredient, portions: number): string {
  const n = i.amount * portions;
  if (i.unit === 'Prise') return n <= 1 ? '1 Prise' : `${Math.ceil(n)} Prisen`;
  if (i.unit === 'g' || i.unit === 'ml') return n >= 1000 ? `${de(n / 1000)} ${i.unit === 'g' ? 'kg' : 'l'}` : `${Math.round(n / 5) * 5 || Math.round(n)} ${i.unit}`;
  const v = Math.round(n * 2) / 2;
  const t = v === 0.5 ? '½' : Number.isInteger(v) ? String(v) : `${Math.floor(v)}½`;
  if (i.unit === 'Stk') return t;
  if (i.unit === 'Zehe') return `${t} ${v > 1 ? 'Zehen' : 'Zehe'}`;
  if (i.unit === 'Scheibe') return `${t} ${v > 1 ? 'Scheiben' : 'Scheibe'}`;
  if (i.unit === 'Dose') return `${t} ${v > 1 ? 'Dosen' : 'Dose'}`;
  return `${t} ${i.unit}`;
}

export type ShopItem = { key: string; name: string; amount: string; state: ItemState; dishes: string[] };
export type ShopList = { sections: { section: Section; items: ShopItem[] }[]; have: ShopItem[]; open: number; total: number };

/** Every ingredient of the week, summed over the portions really eaten, grouped by supermarket section. */
export function shoppingList(plan: MealPlan, state: MealState): ShopList {
  const acc = new Map<string, { name: string; unit: Unit; amount: number; section: Section; dishes: Set<string> }>();
  for (const m of plan.meals) {
    if (m.reuseOf) continue;
    const portions = cookPortions(plan, state, mealKey(m.day, m.slot)).total;
    if (portions === 0) continue;
    for (const i of m.dish.ingredients) {
      const key = itemKey(i.name, i.unit);
      const have = acc.get(key);
      if (have) { have.amount += i.amount * portions; have.dishes.add(m.dish.title); } else acc.set(key, { name: i.name.trim(), unit: i.unit, amount: i.amount * portions, section: i.section, dishes: new Set([m.dish.title]) });
    }
  }
  const all = [...acc.entries()].map(([key, a]) => ({ section: a.section, item: { key, name: a.name, amount: shopAmount(a.name, a.unit, a.amount), state: state.items[key]?.state ?? 'offen', dishes: [...a.dishes] } as ShopItem }));
  const byName = (x: ShopItem, y: ShopItem) => x.name.localeCompare(y.name, 'de');
  const sections = SECTIONS.map((section) => ({ section, items: all.filter((x) => x.section === section && x.item.state !== 'da').map((x) => x.item).sort(byName) })).filter((s) => s.items.length > 0);
  const have = all.filter((x) => x.item.state === 'da').map((x) => x.item).sort(byName);
  return { sections, have, open: all.filter((x) => x.item.state === 'offen').length, total: all.length };
}

// ---- Reading records: anything else is skipped, never thrown ----

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === 'string';
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

const readIngredient = (x: unknown): Ingredient | null =>
  isObj(x) && str(x.name) && num(x.amount) && UNITS.includes(x.unit as Unit) && SECTIONS.includes(x.section as Section)
    ? { name: x.name, amount: x.amount, unit: x.unit as Unit, section: x.section as Section, ...(x.raw === true ? { raw: true } : {}) } : null;
const readDish = (x: unknown): Dish | null => {
  if (!isObj(x) || !str(x.title) || !Array.isArray(x.ingredients) || !Array.isArray(x.steps) || !num(x.minutes) || !num(x.proteinG) || !num(x.keepsDays)) return null;
  const ingredients = x.ingredients.map(readIngredient);
  if (ingredients.some((i) => i === null) || !x.steps.every(str)) return null;
  return { title: x.title, ingredients: ingredients as Ingredient[], steps: x.steps as string[], minutes: x.minutes, proteinG: x.proteinG, keepsDays: x.keepsDays, source: x.source === 'coach' ? 'coach' : 'liste', ...(str(x.recipeId) ? { recipeId: x.recipeId } : {}) };
};

export function readMealPlan(body: unknown): MealPlan | null {
  if (!isObj(body) || !isWeekKey(body.week) || !Array.isArray(body.people) || !Array.isArray(body.meals)) return null;
  const people = body.people.flatMap((p): Person[] => (isObj(p) && str(p.id) && str(p.name) ? [{ id: p.id, name: p.name, ...(str(p.avatar) ? { avatar: p.avatar } : {}) }] : []));
  const meals = body.meals.flatMap((m): Meal[] => {
    if (!isObj(m) || !num(m.day) || m.day < 0 || m.day > 6 || !SLOTS.includes(m.slot as Slot) || !Array.isArray(m.eaters)) return [];
    const dish = readDish(m.dish);
    if (!dish) return [];
    return [{ day: m.day, slot: m.slot as Slot, dish, reuseOf: str(m.reuseOf) && parseMealKey(m.reuseOf) ? m.reuseOf : null, eaters: m.eaters.filter(str), takeAlong: m.takeAlong === true }];
  });
  const trainingDays = Array.isArray(body.trainingDays) ? body.trainingDays.filter((d): d is number => num(d) && d >= 0 && d <= 6) : [];
  const source = body.source === 'coach' || body.source === 'gemischt' ? body.source : 'liste';
  return { week: body.week, createdMs: num(body.createdMs) ? body.createdMs : 0, source, people, meals, trainingDays };
}

export function readMealState(body: unknown): MealState {
  const out: MealState = { eaters: {}, items: {} };
  if (!isObj(body)) return out;
  if (isObj(body.eaters)) {
    for (const [key, per] of Object.entries(body.eaters)) {
      if (!parseMealKey(key) || !isObj(per)) continue;
      for (const [p, v] of Object.entries(per)) if (isObj(v) && typeof v.on === 'boolean' && num(v.atMs)) (out.eaters[key] ??= {})[p] = { on: v.on, atMs: v.atMs };
    }
  }
  if (isObj(body.items)) {
    for (const [k, v] of Object.entries(body.items)) if (isObj(v) && (v.state === 'offen' || v.state === 'gekauft' || v.state === 'da') && num(v.atMs)) out.items[k] = { state: v.state, atMs: v.atMs };
  }
  return out;
}

/** Record ids of the `mealplan` kind. */
export const planRecordId = (week: string) => `week-${week}`;
export const stateRecordId = (week: string) => `state-${week}`;
export const weekOfRecordId = (id: string): { week: string; part: 'week' | 'state' } | null => {
  const m = /^(week|state)-(\d{4}-\d{2}-\d{2})$/.exec(id);
  return m && isWeekKey(m[2]) ? { week: m[2]!, part: m[1] as 'week' | 'state' } : null;
};

export const initialOf = (p: Person): string => p.avatar || (p.name.trim()[0] ?? '?').toUpperCase();

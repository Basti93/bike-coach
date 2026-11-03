import { useMemo, useRef, useState } from 'react';
import type { TrackedRecord } from '../shared/records';
import {
  addWeeks, cookPortions, DAY_LONG, DAY_SHORT, dayDate, dayIndex, eatersOf, initialOf, mealKey, readMealPlan, readMealState, recipeAmount,
  shoppingList, SLOT_LABEL, SLOT_TIME, SLOTS, stateRecordId, weekOf, weekRangeText, withEater, withItem,
  type ItemState, type Meal, type MealPlan, type MealState, type ShopItem,
} from '../shared/meals';
import type { WebPort } from './webPort';
import { usePortRecords } from '../tracking/ui/hooks';

type Week = { plan: MealPlan; state: MealState };

/** The readable plans of this and next week, from the account's records. */
export function mealWeeks(records: TrackedRecord[] | null, now: number): Week[] {
  const current = weekOf(now);
  return [current, addWeeks(current, 1)].flatMap((w) => {
    const rec = (records ?? []).find((r) => r.id === `week-${w}` && !r.deleted);
    const plan = rec ? readMealPlan(rec.body) : null;
    if (!plan) return [];
    const stateRec = (records ?? []).find((r) => r.id === stateRecordId(w) && !r.deleted);
    return [{ plan, state: readMealState(stateRec?.body) }];
  });
}

const short = (k: string) => { const [d, s] = k.split('-'); return `${DAY_SHORT[Number(d)]}${s === 'mittag' ? '' : ` ${SLOT_LABEL[s as keyof typeof SLOT_LABEL]}`}`; };
const color = (plan: MealPlan, id: string) => Math.max(0, plan.people.findIndex((p) => p.id === id)) % 4;
const NEXT: Record<ItemState, ItemState> = { offen: 'gekauft', gekauft: 'offen', da: 'offen' };

function MealCard({ week, meal, onEater }: { week: Week; meal: Meal; onEater: (person: string, on: boolean) => void }) {
  const k = mealKey(meal.day, meal.slot);
  const eaters = eatersOf(week.plan, week.state, k);
  const reuses = week.plan.meals.filter((m) => m.reuseOf === k);
  const cook = cookPortions(week.plan, week.state, k);
  return (
    <section className={`card pm-meal slot-${meal.slot}${eaters.length === 0 ? ' pm-empty' : ''}`} aria-label={`${SLOT_LABEL[meal.slot]}: ${meal.dish.title}`}>
      <div className="pm-slot"><b>{SLOT_LABEL[meal.slot]}</b> <span>{SLOT_TIME[meal.slot]}{meal.takeAlong ? ' · zum Mitnehmen' : meal.slot === 'abend' ? ' · kleine Portion' : ''}</span></div>
      {meal.reuseOf && <span className="pm-badge">Rest von {short(meal.reuseOf)}: nur einpacken</span>}
      <h2>{meal.dish.title}</h2>
      <p className="pm-meta">{!meal.reuseOf && <>{meal.dish.minutes} Min · </>}<b>{meal.dish.proteinG} g</b> Eiweiß pro Portion{reuses.length > 0 && <> · reicht für {reuses.map((r) => short(mealKey(r.day, r.slot))).join(', ')}</>}</p>
      <div className="tk-row pm-people">
        {week.plan.people.map((p) => {
          const on = eaters.includes(p.id);
          return (
            <button key={p.id} type="button" className={`pm-person${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${p.name} isst ${on ? 'mit' : 'nicht mit'}`} onClick={() => onEater(p.id, !on)}>
              <span className={`pm-avatar pc${color(week.plan, p.id)}`} aria-hidden="true">{initialOf(p)}</span>{p.name}
            </button>
          );
        })}
      </div>
      <details className="pm-recipe">
        <summary>Rezept{!meal.reuseOf && cook.total > 0 ? ` für ${cook.total} ${cook.total === 1 ? 'Portion' : 'Portionen'}` : ''}</summary>
        {!meal.reuseOf && cook.total > 0 && <ul className="pm-ingredients">{meal.dish.ingredients.map((i, n) => <li key={n}><b>{recipeAmount(i, cook.total)}</b> {i.name}</li>)}</ul>}
        <ol className="pm-steps">{meal.dish.steps.map((s, n) => <li key={n}>{s}</li>)}</ol>
        <p className="muted pm-keeps">{meal.dish.keepsDays === 0 ? 'Am besten frisch essen.' : `Hält im Kühlschrank ${meal.dish.keepsDays} ${meal.dish.keepsDays === 1 ? 'Tag' : 'Tage'}.`}</p>
      </details>
    </section>
  );
}

function Shopping({ week, onSet }: { week: Week; onSet: (item: string, state: ItemState) => void }) {
  const list = shoppingList(week.plan, week.state);
  const row = (i: ShopItem) => (
    <li key={i.key} className={`pm-item ${i.state}`}>
      <button type="button" className="pm-check" role="checkbox" aria-checked={i.state === 'gekauft'} aria-label={`${i.name} gekauft`} onClick={() => onSet(i.key, NEXT[i.state])}>{i.state === 'gekauft' ? '✓' : ''}</button>
      <span className="pm-name">{i.name}{i.amount !== 'aus dem Vorrat' && <small>{i.amount}</small>}</span>
      <button type="button" className="pm-have" aria-label={i.state === 'da' ? `${i.name} doch kaufen` : `${i.name} schon da`} onClick={() => onSet(i.key, i.state === 'da' ? 'offen' : 'da')}>{i.state === 'da' ? 'doch kaufen' : 'schon da'}</button>
    </li>
  );
  if (list.total === 0) return <p className="muted">Diese Woche gibt es nichts einzukaufen.</p>;
  return (
    <>
      <p className="pm-summary"><b>{list.open}</b> von {list.total} noch offen</p>
      {list.sections.map((s) => <section key={s.section} className="card pm-shop"><h3>{s.section}</h3><ul>{s.items.map(row)}</ul></section>)}
      {list.pantry.length > 0 && <section className="card pm-shop"><h3>Kleine Mengen: kurz prüfen, ob da</h3><ul>{list.pantry.map(row)}</ul></section>}
      {list.have.length > 0 && <section className="card pm-shop pm-have-list"><h3>Schon da</h3><ul>{list.have.map(row)}</ul></section>}
    </>
  );
}

/** The meal plan on the phone: one day at a time with a day picker, and the shopping list. Ticks and who eats go back to the Mac. */
export function MealsScreen({ port, now }: { port: WebPort; now: () => number }) {
  const records = usePortRecords(port, 'mealplan').records;
  const t = now();
  const weeks = useMemo(() => mealWeeks(records, t), [records, t]);
  const current = weekOf(t);
  const today = dayIndex(t);
  const first = (today >= 5 && weeks.find((w) => w.plan.week !== current)) || weeks.find((w) => w.plan.week === current) || weeks[0];
  // Records arrive after the first render: nothing chosen yet means the default, decided once they are there.
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const week = weeks.find((w) => w.plan.week === weekKey) ?? first;
  const isCurrent = week?.plan.week === current;
  const [dayPick, setDay] = useState<number | null>(null);
  const day = dayPick ?? (isCurrent ? today : 0);
  const [tab, setTab] = useState<'tage' | 'einkauf'>('tage');
  const queue = useRef<Promise<void>>(Promise.resolve());
  if (!week) return <div className="tk-screen"><h1 className="tk-title">Essen</h1><p className="muted">Noch kein Essensplan da. Der Mac plant samstagmorgens die kommende Woche.</p></div>;

  /** One more change on top of what this phone has; the newer entry wins on the Mac. */
  /** One at a time, each on the freshest stored state, so quick taps never undo each other. */
  const change = (f: (s: MealState, at: number) => MealState) => {
    const id = stateRecordId(week.plan.week);
    queue.current = queue.current.then(async () => {
      const at = now();
      const have = (await port.list('mealplan')).find((r) => r.id === id);
      await port.put({ kind: 'mealplan', id, updatedMs: Math.max(at, (have?.updatedMs ?? 0) + 1), deleted: false, body: f(readMealState(have?.deleted ? undefined : have?.body), at) });
    }).catch(() => { /* shown as before; nothing lost */ });
    return queue.current;
  };
  const list = shoppingList(week.plan, week.state);
  const pick = (w: Week) => { setWeekKey(w.plan.week); setDay(w.plan.week === current ? today : 0); };
  return (
    <div className="tk-screen pm">
      <div className="pm-head">
        <h1 className="tk-title">Essen</h1>
        <span className="muted">{isCurrent ? 'Diese Woche' : 'Nächste Woche'}, {weekRangeText(week.plan.week)}</span>
      </div>
      {weeks.length > 1 && (
        <div className="pm-seg" role="group" aria-label="Woche">
          {weeks.map((w) => <button key={w.plan.week} type="button" aria-pressed={w === week} onClick={() => pick(w)}>{w.plan.week === current ? 'Diese Woche' : 'Nächste Woche'}</button>)}
        </div>
      )}
      <div className="pm-seg" role="group" aria-label="Ansicht">
        <button type="button" aria-pressed={tab === 'tage'} onClick={() => setTab('tage')}>Tage</button>
        <button type="button" aria-pressed={tab === 'einkauf'} onClick={() => setTab('einkauf')}>Einkauf{list.open > 0 ? ` · ${list.open}` : ''}</button>
      </div>
      {tab === 'tage' ? (
        <>
          <div className="pm-days" role="tablist" aria-label="Tag">
            {DAY_SHORT.map((d, i) => (
              <button key={d} type="button" role="tab" aria-selected={i === day} className={`${isCurrent && i === today ? 'today' : ''}${isCurrent && i < today ? ' past' : ''}`} onClick={() => setDay(i)}>
                <b>{d}</b><span>{dayDate(week.plan.week, i).split('.')[0]}</span>
              </button>
            ))}
          </div>
          <h2 className="pm-dayname">{isCurrent && day === today ? 'Heute' : DAY_LONG[day]}{week.plan.trainingDays.includes(day) && <small> · Trainingstag</small>}</h2>
          {SLOTS.map((slot) => {
            const m = week.plan.meals.find((x) => x.day === day && x.slot === slot);
            return m
              ? <MealCard key={slot} week={week} meal={m} onEater={(person, on) => void change((s, at) => withEater(s, mealKey(m.day, m.slot), person, on, at))} />
              : <section key={slot} className="card pm-meal pm-empty"><div className="pm-slot"><b>{SLOT_LABEL[slot]}</b></div><p className="muted">Frei.</p></section>;
          })}
        </>
      ) : <Shopping week={week} onSet={(item, state) => void change((s, at) => withItem(s, item, state, at))} />}
    </div>
  );
}

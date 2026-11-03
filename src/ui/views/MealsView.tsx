import { useEffect, useState } from 'react';
import type { MealsView as MealsData, MealWeek } from '../../coach/meals/meal-coach';
import type { CoachClientMessage } from '../../shared/coach-protocol';
import {
  cookPortions, DAY_LONG, DAY_SHORT, dayDate, eatersOf, initialOf, mealKey, recipeAmount, shoppingList, SLOT_LABEL, SLOT_TIME, SLOTS,
  weekRangeText, type ItemState, type Meal, type Person, type ShopItem, type Slot,
} from '../../shared/meals';

type Props = { profileId: string; meals: MealsData; send: (m: CoachClientMessage) => void };

const SLOT_NOTE: Record<Slot, string> = { fruehstueck: 'vor der Arbeit', mittag: 'werktags zum Mitnehmen', abend: 'kleine Portion' };
const keyOf = (m: Meal) => mealKey(m.day, m.slot);
const short = (k: string) => { const [d, s] = k.split('-'); return `${DAY_SHORT[Number(d)]}${s === 'mittag' ? '' : ` ${SLOT_LABEL[s as Slot]}`}`; };
export const personColor = (people: Person[], id: string): number => Math.max(0, people.findIndex((p) => p.id === id)) % 4;

export const Avatars = ({ people, ids }: { people: Person[]; ids: string[] }) => (
  <span className="meal-people" aria-label={ids.length ? `Isst: ${people.filter((p) => ids.includes(p.id)).map((p) => p.name).join(', ')}` : 'Niemand isst mit'}>
    {ids.length === 0 ? <span className="meal-nobody">niemand</span> : people.filter((p) => ids.includes(p.id)).map((p) => (
      <span key={p.id} className={`meal-avatar pc${personColor(people, p.id)}`} aria-hidden="true">{initialOf(p)}</span>
    ))}
  </span>
);

/** The week shown first: on the weekend the coming week once it is planned, otherwise this one. */
export const firstWeek = (m: MealsData): string | null => {
  const next = m.weeks.find((w) => w.plan.week !== m.currentWeek);
  if (next && m.today >= 5) return next.plan.week;
  return m.weeks.find((w) => w.plan.week === m.currentWeek)?.plan.week ?? next?.plan.week ?? null;
};

const MealCard = ({ week, meal, today, onOpen }: { week: MealWeek; meal: Meal; today: boolean; onOpen: () => void }) => {
  const k = keyOf(meal);
  const eaters = eatersOf(week.plan, week.state, k);
  const reuses = week.plan.meals.filter((m) => m.reuseOf === k);
  return (
    <button type="button" className={`meal-card slot-${meal.slot}${meal.reuseOf ? ' rest' : ''}${eaters.length === 0 ? ' empty' : ''}${today ? ' today' : ''}`} onClick={onOpen}
      aria-label={`${DAY_LONG[meal.day]}, ${SLOT_LABEL[meal.slot]}: ${meal.dish.title}`}>
      {meal.reuseOf && <span className="meal-badge rest">Rest von {short(meal.reuseOf)}</span>}
      <span className="meal-title">{meal.dish.title}</span>
      <span className="meal-meta">
        {!meal.reuseOf && <span>{meal.dish.minutes} Min</span>}
        <span><b>{meal.dish.proteinG} g</b> Eiweiß</span>
      </span>
      <span className="meal-foot">
        <Avatars people={week.plan.people} ids={eaters} />
        {reuses.length > 0 && <span className="meal-badge twice" title="Einmal kochen, mehrmals essen">reicht für {reuses.map((r) => short(keyOf(r))).join(', ')}</span>}
      </span>
    </button>
  );
};

const RecipePanel = ({ profileId, week, meal, canPlan, planning, send, onClose }: { profileId: string; week: MealWeek; meal: Meal; canPlan: boolean; planning: string | null; send: Props['send']; onClose: () => void }) => {
  const k = keyOf(meal);
  const eaters = eatersOf(week.plan, week.state, k);
  const source = meal.reuseOf ? week.plan.meals.find((m) => keyOf(m) === meal.reuseOf) : meal;
  const cook = cookPortions(week.plan, week.state, source ? keyOf(source) : k);
  const busy = planning !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="meal-panel-backdrop" onClick={onClose}>
      <aside className={`meal-panel slot-${meal.slot}`} role="dialog" aria-label={meal.dish.title} onClick={(e) => e.stopPropagation()}>
        <div className="meal-panel-head">
          <span className={`meal-slot-tag slot-${meal.slot}`}>{DAY_LONG[meal.day]} · {SLOT_LABEL[meal.slot]} · {SLOT_TIME[meal.slot]}</span>
          <button type="button" className="ghost meal-close" aria-label="Schließen" onClick={onClose}>×</button>
        </div>
        <h2>{meal.dish.title}</h2>
        <dl className="facts">
          {!meal.reuseOf && <div><dt>Zeit</dt><dd>{meal.dish.minutes} Min</dd></div>}
          <div><dt>Eiweiß pro Portion</dt><dd>etwa {meal.dish.proteinG} g</dd></div>
          <div><dt>Hält im Kühlschrank</dt><dd>{meal.dish.keepsDays === 0 ? 'frisch essen' : `${meal.dish.keepsDays} ${meal.dish.keepsDays === 1 ? 'Tag' : 'Tage'}`}</dd></div>
        </dl>
        <section>
          <h3>Wer isst mit</h3>
          <div className="row meal-toggles">
            {week.plan.people.map((p) => {
              const on = eaters.includes(p.id);
              return (
                <button key={p.id} type="button" className={`meal-toggle${on ? ' on' : ''}`} aria-pressed={on}
                  onClick={() => send({ type: 'meals-eater', profileId, week: week.plan.week, meal: k, person: p.id, on: !on })}>
                  <span className={`meal-avatar pc${personColor(week.plan.people, p.id)}`} aria-hidden="true">{initialOf(p)}</span>{p.name}
                </button>
              );
            })}
          </div>
        </section>
        {meal.reuseOf && source ? (
          <p className="meal-rest-note">Das ist der Rest von {DAY_LONG[source.day]}, {SLOT_LABEL[source.slot]}. Heute gibt es nichts zu kochen, nur einpacken.</p>
        ) : (
          <section>
            <h3>Zutaten{cook.total > 0 ? ` für ${cook.total} ${cook.total === 1 ? 'Portion' : 'Portionen'}` : ''}</h3>
            {cook.parts.length > 1 && cook.total > 0 && <p className="muted meal-cook-for">Einmal kochen für {cook.parts.filter((x) => x.count > 0).map((x) => `${DAY_SHORT[x.day]} ${x.count}`).join(', ')}.</p>}
            {cook.total === 0 ? <p className="muted">Gerade isst niemand mit, also steht nichts davon auf der Einkaufsliste.</p> : (
              <ul className="meal-ingredients">
                {meal.dish.ingredients.map((i, n) => <li key={n}><span className="amount">{recipeAmount(i, cook.total)}</span> {i.name}</li>)}
              </ul>
            )}
          </section>
        )}
        <section>
          <h3>So geht’s</h3>
          <ol className="meal-steps">{meal.dish.steps.map((s, n) => <li key={n}>{s}</li>)}</ol>
        </section>
        <div className="meal-panel-actions">
          <button type="button" className="secondary" disabled={!canPlan || busy} onClick={() => send({ type: 'meals-swap', profileId, week: week.plan.week, meal: k, ai: false })}>Tauschen</button>
          <button type="button" className="ghost" disabled={!canPlan || busy} onClick={() => send({ type: 'meals-swap', profileId, week: week.plan.week, meal: k, ai: true })}>{planning === k ? 'Der Coach überlegt …' : 'Coach fragen'}</button>
        </div>
        <p className="muted meal-source">{meal.dish.source === 'coach' ? 'Vorschlag vom Coach.' : 'Aus Pandafits Rezeptliste.'} Bei Unverträglichkeiten die Zutaten bitte selbst prüfen.</p>
      </aside>
    </div>
  );
};

const NEXT_STATE: Record<ItemState, ItemState> = { offen: 'gekauft', gekauft: 'offen', da: 'offen' };

export const ShoppingView = ({ week, onSet }: { week: MealWeek; onSet: (item: string, state: ItemState) => void }) => {
  const list = shoppingList(week.plan, week.state);
  const row = (i: ShopItem) => (
    <li key={i.key} className={`shop-item ${i.state}`}>
      <button type="button" className="shop-check" role="checkbox" aria-checked={i.state === 'gekauft'} aria-label={`${i.name} gekauft`} onClick={() => onSet(i.key, NEXT_STATE[i.state])}>{i.state === 'gekauft' ? '✓' : ''}</button>
      <span className="shop-name" title={`Für: ${i.dishes.join(', ')}`}>{i.name}</span>
      {i.amount !== 'aus dem Vorrat' && <span className="shop-amount">{i.amount}</span>}
      {i.state === 'da'
        ? <button type="button" className="shop-have" onClick={() => onSet(i.key, 'offen')}>doch kaufen</button>
        : <button type="button" className="shop-have" onClick={() => onSet(i.key, 'da')} aria-label={`${i.name} schon da`}>schon da</button>}
    </li>
  );
  if (list.total === 0) return <p className="muted card">Diese Woche gibt es nichts einzukaufen.</p>;
  return (
    <div className="shopping">
      <p className="shop-summary"><b>{list.open}</b> von {list.total} noch offen</p>
      <div className="shop-sections">
        {list.sections.map((s) => (
          <section key={s.section} className="card shop-section">
            <h3>{s.section}</h3>
            <ul>{s.items.map(row)}</ul>
          </section>
        ))}
        {list.pantry.length > 0 && (
          <section className="card shop-section shop-pantry">
            <h3>Kleine Mengen: kurz prüfen, ob da</h3>
            <ul>{list.pantry.map(row)}</ul>
          </section>
        )}
        {list.have.length > 0 && (
          <section className="card shop-section shop-have-list">
            <h3>Schon da</h3>
            <ul>{list.have.map(row)}</ul>
          </section>
        )}
      </div>
    </div>
  );
};

/** The household's week as a grid: days across, meals down, one card per meal. The recipe opens on the side. */
export const MealsView = ({ profileId, meals, send }: Props) => {
  const [weekKey, setWeekKey] = useState<string | null>(() => firstWeek(meals));
  const [tab, setTab] = useState<'woche' | 'einkauf'>('woche');
  const [open, setOpen] = useState<string | null>(null);
  const week = meals.weeks.find((w) => w.plan.week === weekKey) ?? meals.weeks.find((w) => w.plan.week === firstWeek(meals)) ?? null;
  const isCurrent = week?.plan.week === meals.currentWeek;
  const planning = meals.planning;
  const nextWeek = meals.weeks.find((w) => w.plan.week !== meals.currentWeek)?.plan.week;
  const meal = week && open ? week.plan.meals.find((m) => keyOf(m) === open) : undefined;

  if (!week) {
    return (
      <main className="meals">
        <div className="top"><h1>Essen</h1></div>
        <section className="card meals-empty">
          {planning ? <p role="status">Der Plan entsteht gerade. Das dauert einen Moment.</p> : <>
            <p>Noch kein Plan für diese Woche. Am Samstagmorgen plant Pandafit die kommende Woche von selbst.</p>
            <button type="button" disabled={!meals.canPlan} onClick={() => send({ type: 'meals-replan', profileId, week: meals.currentWeek })}>Plan für diese Woche erstellen</button>
            {!meals.canPlan && <p className="muted">Nach der Fahrt geht’s weiter.</p>}
          </>}
        </section>
      </main>
    );
  }
  return (
    <main className="meals">
      <div className="top meals-top">
        <div>
          <h1>Essen</h1>
          <p className="muted">{isCurrent ? 'Diese Woche' : 'Nächste Woche'}, {weekRangeText(week.plan.week)}</p>
        </div>
        <div className="row meals-tools">
          {meals.weeks.length > 1 && (
            <div className="seg" role="group" aria-label="Woche">
              <button type="button" aria-pressed={isCurrent} onClick={() => setWeekKey(meals.currentWeek)}>Diese Woche</button>
              <button type="button" aria-pressed={!isCurrent} onClick={() => setWeekKey(nextWeek ?? null)}>Nächste Woche</button>
            </div>
          )}
          <div className="seg" role="group" aria-label="Ansicht">
            <button type="button" aria-pressed={tab === 'woche'} onClick={() => setTab('woche')}>Wochenplan</button>
            <button type="button" aria-pressed={tab === 'einkauf'} onClick={() => setTab('einkauf')}>Einkaufsliste</button>
          </div>
          <button type="button" className="ghost" disabled={!meals.canPlan || planning !== null} onClick={() => send({ type: 'meals-replan', profileId, week: week.plan.week })}
            title={isCurrent ? 'Plant die Tage ab heute neu' : 'Plant die ganze Woche neu'}>{planning === week.plan.week ? 'Plant …' : 'Neu planen'}</button>
        </div>
      </div>
      {week.notice && <p className="notice meals-notice" role="status">{week.notice}</p>}
      {tab === 'woche' ? (
        <div className="meal-grid" role="grid" aria-label={`Wochenplan ${weekRangeText(week.plan.week)}`}>
          <div className="meal-corner" />
          {DAY_SHORT.map((d, day) => {
            const today = isCurrent && day === meals.today;
            return (
              <div key={d} role="columnheader" className={`meal-day${today ? ' today' : ''}${isCurrent && day < meals.today ? ' past' : ''}`}>
                <b>{d}</b> <span>{dayDate(week.plan.week, day)}</span>
                {today ? <em>Heute</em> : week.plan.trainingDays.includes(day) ? <small>Training</small> : null}
              </div>
            );
          })}
          {SLOTS.map((slot) => (
            <div key={slot} className="meal-row" role="row">
              <div className={`meal-rowhead slot-${slot}`} role="rowheader"><b>{SLOT_LABEL[slot]}</b><span>{SLOT_TIME[slot]} · {SLOT_NOTE[slot]}</span></div>
              {DAY_SHORT.map((d, day) => {
                const m = week.plan.meals.find((x) => x.day === day && x.slot === slot);
                const today = isCurrent && day === meals.today;
                return (
                  <div key={d} role="gridcell" className={`meal-cell${today ? ' today' : ''}${isCurrent && day < meals.today ? ' past' : ''}`}>
                    {m ? <MealCard week={week} meal={m} today={today} onOpen={() => setOpen(keyOf(m))} /> : <span className="meal-free">frei</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : <ShoppingView week={week} onSet={(item, state) => send({ type: 'meals-item', profileId, week: week.plan.week, item, state })} />}
      {meal && <RecipePanel profileId={profileId} week={week} meal={meal} canPlan={meals.canPlan} planning={planning} send={send} onClose={() => setOpen(null)} />}
    </main>
  );
};

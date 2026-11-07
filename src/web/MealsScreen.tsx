import { useId, useMemo, useRef, useState } from 'react';
import type { TrackedRecord } from '../shared/records';
import {
  addWeeks, changeOwn, CHAT_MAX_CHARS, isOwnKey, newOwnKey, OWN_AMOUNT_MAX, OWN_NAME_MAX, withOwn, cookPortions, isChatRecordId, newChatId, readMealChat, DAY_LONG, DAY_SHORT, dayDate, dayIndex, eatersOf, initialOf, mealKey, readMealPlan, readMealState, recipeAmount,
  shoppingList, SLOT_LABEL, SLOT_TIME, SLOTS, stateRecordId, weekOf, withEater, withItem,
  type ItemState, type Meal, type MealChat, type MealPlan, type MealState, type ShopItem,
} from '../shared/meals';
import { weekRangeOfKey } from '../shared/dates';
import type { WebPort } from './webPort';
import { usePortRecords } from '../tracking/ui/hooks';
import { ConfirmLink, PageHead, Row, RowList, Sheet } from '../tracking/ui/kit';

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

/** This person's messages to the coach about the plan, oldest first. */
export const mealChats = (records: TrackedRecord[] | null): MealChat[] =>
  (records ?? []).flatMap((r) => { const c = !r.deleted && isChatRecordId(r.id) ? readMealChat(r.id, r.body) : null; return c ? [c] : []; }).sort((a, b) => a.atMs - b.atMs);

const chatDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const ChatRow = ({ c }: { c: MealChat }) => (
  <li>
    <p className="pm-said">{c.text}<small>{chatDate(c.atMs)}</small></p>
    <p className={c.reply ? 'pm-reply' : 'pm-reply pending'}>{c.reply ?? 'Der Coach antwortet gleich. Ist der Mac aus, dauert es, bis er wieder an ist.'}</p>
  </li>
);

/** "Änderung wünschen": written as a record, answered by the Mac at its next sync with no ride open. */
function ChatSheet({ chat, onSend, onClose }: { chat: MealChat[]; onSend: (text: string) => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState('');
  const formId = useId();
  const [last, ...before] = [...chat].reverse();
  const submit = () => { const t = text.trim(); if (!t) return; setText(''); void onSend(t); };
  return (
    <Sheet title="Änderung wünschen" onClose={onClose} actions={<button type="submit" form={formId} disabled={!text.trim()}>Senden</button>}>
      <form id={formId} className="tk-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="tk-field"><span>Sag dem Coach, was du ändern willst</span>
          <input autoFocus aria-label="Nachricht an den Coach" maxLength={CHAT_MAX_CHARS} placeholder="z. B. Mittwoch lieber Nudeln" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </form>
      {last && <ul className="pm-chat-list"><ChatRow c={last} /></ul>}
      {before.length > 0 && (
        <details className="pm-chat-before">
          <summary>Bisheriges Gespräch ({before.length})</summary>
          <ul className="pm-chat-list">{before.map((c) => <ChatRow key={c.id} c={c} />)}</ul>
        </details>
      )}
    </Sheet>
  );
}

const short = (k: string) => { const [d, s] = k.split('-'); return `${DAY_SHORT[Number(d)]}${s === 'mittag' ? '' : ` ${SLOT_LABEL[s as keyof typeof SLOT_LABEL]}`}`; };
const color = (plan: MealPlan, id: string) => Math.max(0, plan.people.findIndex((p) => p.id === id)) % 4;
const NEXT: Record<ItemState, ItemState> = { offen: 'gekauft', gekauft: 'offen', da: 'offen' };
const listAnd = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}` : names[0] ?? '');

/** One meal as a row; opened, it shows the recipe, the protein and who eats. A deviation from the plan shows under the title. */
function MealRow({ week, meal, open, onToggle, onEater }: { week: Week; meal: Meal; open: boolean; onToggle: () => void; onEater: (person: string, on: boolean) => void }) {
  const k = mealKey(meal.day, meal.slot);
  const eaters = eatersOf(week.plan, week.state, k);
  const away = week.plan.people.filter((p) => !eaters.includes(p.id));
  const reuses = week.plan.meals.filter((m) => m.reuseOf === k);
  const cook = cookPortions(week.plan, week.state, k);
  const note = eaters.length === 0 ? 'Niemand isst mit' : away.length > 0 ? `${listAnd(away.map((p) => p.name))} ${away.length > 1 ? 'essen' : 'isst'} nicht mit` : null;
  const askedBy = meal.askedBy ? week.plan.people.find((p) => p.id === meal.askedBy) : undefined;
  return (
    <Row
      title={<><span className="pm-rowtitle"><b>{SLOT_LABEL[meal.slot]}</b> · {meal.dish.title}</span>{note && <small className="pm-dev">{note}</small>}</>}
      value={meal.reuseOf ? 'Rest' : `${meal.dish.minutes} Min`} expanded={open} onClick={onToggle}>
      <p className="pm-meta">{SLOT_TIME[meal.slot]}{meal.takeAlong ? ' · zum Mitnehmen' : meal.slot === 'abend' ? ' · kleine Portion' : ''}{meal.reuseOf ? ` · Rest von ${short(meal.reuseOf)}: nur einpacken` : ''}</p>
      {askedBy && <p className="pm-asked">auf Wunsch von {askedBy.name}</p>}
      <p className="pm-meta"><b>{meal.dish.proteinG} g</b> Eiweiß pro Portion{reuses.length > 0 && <> · reicht für {reuses.map((r) => short(mealKey(r.day, r.slot))).join(', ')}</>}</p>
      <div className="tk-row pm-people" role="group" aria-label="Wer isst mit">
        {week.plan.people.map((p) => {
          const on = eaters.includes(p.id);
          return (
            <button key={p.id} type="button" className={`pm-person${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${p.name} isst ${on ? 'mit' : 'nicht mit'}`} onClick={() => onEater(p.id, !on)}>
              <span className={`pm-avatar pc${color(week.plan, p.id)}`} aria-hidden="true">{initialOf(p)}</span>{p.name}
            </button>
          );
        })}
      </div>
      {!meal.reuseOf && cook.total > 0 && (
        <>
          <h3 className="tk-section">Rezept für {cook.total} {cook.total === 1 ? 'Portion' : 'Portionen'}</h3>
          <ul className="pm-ingredients">{meal.dish.ingredients.map((i, n) => <li key={n}><b>{recipeAmount(i, cook.total)}</b> {i.name}</li>)}</ul>
        </>
      )}
      <ol className="pm-steps">{meal.dish.steps.map((s, n) => <li key={n}>{s}</li>)}</ol>
      <p className="muted pm-keeps">{meal.dish.keepsDays === 0 ? 'Am besten frisch essen.' : `Hält im Kühlschrank ${meal.dish.keepsDays} ${meal.dish.keepsDays === 1 ? 'Tag' : 'Tage'}.`}</p>
    </Row>
  );
}

const SECTION_LABEL: Record<string, string> = { Sonstiges: 'Weiteres' };

/** One flat list with small headings. Tick to buy; the amount opens "Haben wir" (or "Entfernen" on an own item). Bought items sink to the end of their group. */
function Shopping({ week, onSet, onOwn }: { week: Week; onSet: (item: string, state: ItemState) => void; onOwn: (f: (s: MealState, at: number) => MealState) => void }) {
  const list = shoppingList(week.plan, week.state);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const row = (i: ShopItem) => {
    const own = isOwnKey(i.key);
    const bought = i.state === 'gekauft';
    return (
      <li key={i.key} className={`pm-item ${i.state}`}>
        <div className="pm-itemline">
          <button type="button" className="pm-check" role="checkbox" aria-checked={bought} aria-label={`${i.name} gekauft`}
            onClick={() => (own ? onOwn((s, at) => changeOwn(s, i.key, { state: bought ? 'offen' : 'gekauft' }, at)) : onSet(i.key, NEXT[i.state]))}>{bought ? '✓' : ''}</button>
          <span className="pm-name">{i.name}</span>
          <button type="button" className="pm-amount" aria-expanded={open === i.key} aria-label={`${i.name}: ${own ? 'Entfernen' : i.state === 'da' ? 'Doch kaufen' : 'Haben wir'}`} onClick={() => setOpen(open === i.key ? null : i.key)}>
            {i.amount === 'aus dem Vorrat' ? 'Vorrat' : i.amount}<span className={`tk-chevron${open === i.key ? ' open' : ''}`} aria-hidden="true">›</span>
          </button>
        </div>
        {open === i.key && (
          <div className="pm-itemmore">
            {own
              ? <ConfirmLink label="Entfernen" question="Wirklich entfernen?" onConfirm={() => { setOpen(null); onOwn((s, at) => changeOwn(s, i.key, { removed: true }, at)); }} />
              : <button type="button" className="link" onClick={() => { setOpen(null); onSet(i.key, i.state === 'da' ? 'offen' : 'da'); }}>{i.state === 'da' ? 'Doch kaufen' : 'Haben wir'}</button>}
          </div>
        )}
      </li>
    );
  };
  const group = (title: string, items: ShopItem[], cls = '') => {
    // Bought items go to the end of their group.
    const sorted = [...items.filter((i) => i.state !== 'gekauft'), ...items.filter((i) => i.state === 'gekauft')];
    return items.length === 0 ? null : <section key={title} className={`pm-group ${cls}`}><h3 className="tk-section">{title}</h3><ul>{sorted.map(row)}</ul></section>;
  };
  const add = () => {
    const n = name.trim();
    if (!n) return;
    const key = newOwnKey();
    setName(''); setAmount('');
    onOwn((s, at) => withOwn(s, key, n, amount, at));
  };
  return (
    <>
      {list.total === 0 && list.own.length === 0 && <p className="muted">Diese Woche gibt es nichts einzukaufen.</p>}
      {list.sections.map((s) => group(SECTION_LABEL[s.section] ?? s.section, s.items))}
      {group('Kleine Mengen, kurz prüfen', list.pantry)}
      {group('Eigenes', list.own)}
      {group('Schon da', list.have, 'pm-have-list')}
      <form className="pm-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="pm-addline">
          <input aria-label="Etwas dazuschreiben" placeholder="Etwas dazuschreiben …" maxLength={OWN_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
          <input aria-label="Menge (optional)" placeholder="Menge" maxLength={OWN_AMOUNT_MAX} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button type="submit" className="secondary" disabled={!name.trim()}>Hinzufügen</button>
      </form>
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
  const [openMeal, setOpenMeal] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const chat = useMemo(() => mealChats(records), [records]);
  if (!week) return <div className="tk-screen"><PageHead title="Essen" /><p className="muted">Noch kein Essensplan da. Der Mac plant samstagmorgens die kommende Woche.</p></div>;

  /** One at a time, each on the freshest stored state, so quick taps never undo each other. The newer entry wins on the Mac. */
  const change = (f: (s: MealState, at: number) => MealState) => {
    const id = stateRecordId(week.plan.week);
    queue.current = queue.current.then(async () => {
      const at = now();
      const have = (await port.list('mealplan')).find((r) => r.id === id);
      await port.put({ kind: 'mealplan', id, updatedMs: Math.max(at, (have?.updatedMs ?? 0) + 1), deleted: false, body: f(readMealState(have?.deleted ? undefined : have?.body), at) });
    }).catch(() => { /* shown as before; nothing lost */ });
    return queue.current;
  };
  /** A new record of its own: only the Mac writes it again, with the reply. */
  const say = async (text: string) => {
    const at = now();
    await port.put({ kind: 'mealplan', id: newChatId(at), updatedMs: at, deleted: false, body: { week: week.plan.week, text, atMs: at, reply: null, answeredMs: null, changed: [] } }).catch(() => { /* the field stays empty; nothing else is lost */ });
  };
  const list = shoppingList(week.plan, week.state);
  const openCount = list.open + list.own.filter((o) => o.state === 'offen').length;
  const pick = (w: Week) => { setWeekKey(w.plan.week); setDay(w.plan.week === current ? today : 0); setOpenMeal(null); };
  return (
    <div className="tk-screen pm">
      <PageHead title="Essen" subtitle={`${isCurrent ? 'Diese Woche' : 'Nächste Woche'}, ${weekRangeOfKey(week.plan.week)}`} />
      {weeks.length > 1 && (
        <div className="tk-textseg" role="group" aria-label="Woche">
          {weeks.map((w) => <button key={w.plan.week} type="button" className="link" aria-pressed={w === week} onClick={() => pick(w)}>{w.plan.week === current ? 'Diese Woche' : 'Nächste Woche'}</button>)}
        </div>
      )}
      <div className="pm-seg" role="group" aria-label="Ansicht">
        <button type="button" aria-pressed={tab === 'tage'} onClick={() => setTab('tage')}>Tage</button>
        <button type="button" aria-pressed={tab === 'einkauf'} onClick={() => setTab('einkauf')}>Einkauf{openCount > 0 ? ` · ${openCount}` : ''}</button>
      </div>
      {tab === 'tage' ? (
        <>
          <div className="pm-days" role="tablist" aria-label="Tag">
            {DAY_SHORT.map((d, i) => (
              <button key={d} type="button" role="tab" aria-selected={i === day} className={`${isCurrent && i === today ? 'today' : ''}${isCurrent && i < today ? ' past' : ''}`} onClick={() => { setDay(i); setOpenMeal(null); }}>
                <b>{d}</b><span>{dayDate(week.plan.week, i).split('.')[0]}</span>
              </button>
            ))}
          </div>
          <h2 className="pm-dayname">{isCurrent && day === today ? 'Heute' : DAY_LONG[day]}{week.plan.trainingDays.includes(day) && <small> · Trainingstag</small>}</h2>
          <RowList label="Mahlzeiten">
            {SLOTS.map((slot) => {
              const m = week.plan.meals.find((x) => x.day === day && x.slot === slot);
              if (!m) return <Row key={slot} title={SLOT_LABEL[slot]} value="Frei" />;
              const k = mealKey(m.day, m.slot);
              return <MealRow key={slot} week={week} meal={m} open={openMeal === k} onToggle={() => setOpenMeal(openMeal === k ? null : k)} onEater={(person, on) => void change((s, at) => withEater(s, k, person, on, at))} />;
            })}
          </RowList>
          <button type="button" className="secondary" onClick={() => setChatOpen(true)}>Änderung wünschen</button>
          {chatOpen && <ChatSheet chat={chat} onSend={say} onClose={() => setChatOpen(false)} />}
        </>
      ) : <Shopping key={week.plan.week} week={week} onSet={(item, state) => void change((s, at) => withItem(s, item, state, at))} onOwn={(f) => void change(f)} />}
    </div>
  );
}

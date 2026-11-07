import { useState } from 'react';
import { deleteRule, FOCUS_GROUPS, goalRecord, MAX_FOCUS, moveRule, ruleId, ruleRecord, RULE_TEXT_MAX, rulesOf, storedGoalOf, type GoalBody, type Prio, type SportKey, type Strength } from '../../shared/personal';
import { MUSCLE_TARGETS } from '../../shared/muscle-targets';
import { addDays, SPORT_LABEL } from '../../shared/week-plan';
import { dateKey } from '../../shared/day-rating';
import { shortDateOfKey as dayLabel, shortDate } from '../../shared/dates';
import { COACH_LABEL, deleteTask, ONE_OFF_MS, openTasks } from '../../shared/tasks';
import type { TrackedRecord } from '../../shared/records';
import type { TrackingPort } from '../ports';
import { familyLabel, familyLine, familyOf } from '../../shared/families';
import type { Exercise } from '../../shared/exercises';
import { ExercisePicker } from './ExercisePicker';
import { finishedWorkouts, useCatalog, useGoal, usePortRecords } from './hooks';
import { usedSports } from './used-sports';
import { readStats } from '../../shared/stats';
import { ruleNumber } from '../../shared/training-policy';
import type { RunWeekBody } from '../../shared/run';

const STRENGTH_LABEL: Record<Strength, string> = { muscle: 'Muskeln aufbauen', strength: 'Kraft steigern', fitness: 'Fit bleiben' };
const PRIO_LABEL: Record<Prio, string> = { focus: 'Schwerpunkt', equal: 'gleichrangig', keep: 'erhalten' };
// With no activity at all the card shows all three sports; otherwise the used ones, the others behind a toggle.
const SPORTS: SportKey[] = ['gym', 'bike', 'run'];

const WEEK_CHOICES = [0, 2, 4, 6, 8];
const focusLabel = (focus: readonly string[]): string => focus.map((g) => MUSCLE_TARGETS[g as (typeof FOCUS_GROUPS)[number]]?.label ?? g).join(', ');

/** The exercise titles of an exclude rule that its text does not already name; '' when there is nothing to add. */
const excludedTitles = (r: { text: string; exerciseIds?: string[]; families?: string[] }, catalog: readonly { id: string; title: string }[]): string => {
  const titles = (r.exerciseIds ?? []).flatMap((id) => { const t = catalog.find((e) => e.id === id)?.title; return t ? [t] : []; });
  const text = r.text.toLowerCase();
  return [...titles.filter((t) => !text.includes(t.toLowerCase())), ...(familyLine(r) ? [familyLine(r)] : [])].join(', ');
};

/** "Meine Regeln und Ziele": the goal, the rules the person keeps, and a way to add one. Every write is stamped above what is stored. */
export function RulesCard({ port, now, newId }: { port: TrackingPort; now: () => number; newId: () => string }) {
  const goal = useGoal(port, now());
  const stored = storedGoalOf(usePortRecords(port, 'goal').all ?? []);
  const today = dateKey(now());
  const [weeks, setWeeks] = useState(0);
  const catalog = useCatalog(port);
  // Only rules the person keeps: proposed ones (orphans of a failed chat write), declined ones and goal proposals stay out.
  const rules = rulesOf(usePortRecords(port, 'rule').all ?? []).filter((r) => (r.state === 'active' || r.state === 'paused') && r.kind !== 'goal');
  // What was passed on to the coaches and is still open: from the week chat or from one coach to another.
  const tasks = openTasks(usePortRecords(port, 'task').all ?? [], now());
  // Only the sports the person has used lately; one with a priority set always stays.
  const workouts = finishedWorkouts(usePortRecords(port, 'workout').records);
  const runWeeks = (usePortRecords(port, 'run').records ?? []).map((r) => r.body as RunWeekBody).filter((b) => b && b.type === 'week' && Array.isArray(b.runs));
  const statsRecord = (usePortRecords(port, 'stats').records ?? []).find((r) => r.id === 'stats');
  const used = usedSports(workouts, runWeeks, (statsRecord ? readStats(statsRecord.body)?.days : undefined) ?? [], today, ruleNumber('goal.used-sports-days'));
  const [moreSports, setMoreSports] = useState(false);
  const [changingFocus, setChangingFocus] = useState(false);
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attempt = async (f: () => Promise<unknown>) => {
    try { await f(); setError(null); } catch { setError('Konnte nicht gespeichert werden. Versuch es gleich nochmal.'); }
  };
  const saveGoal = (g: Omit<GoalBody, 'atMs'>) => attempt(async () => {
    const have = (await port.list('goal')).find((r) => r.id === 'goal');
    await port.put(goalRecord(g, now(), have));
  });
  const current = async (id: string): Promise<TrackedRecord | undefined> => (await port.list('rule')).find((r) => r.id === id);
  const move = (id: string, to: 'active' | 'paused') => attempt(async () => {
    const cur = await current(id);
    const next = cur ? moveRule(cur, to, now()) : null;
    if (next) await port.put(next);
  });
  const remove = (id: string) => attempt(async () => {
    const cur = await current(id);
    if (cur) await port.put(deleteRule(cur, now()));
  });
  const removeTask = (id: string) => attempt(async () => {
    const cur = (await port.list('task')).find((r) => r.id === id);
    if (cur) await port.put(deleteTask(cur, now()));
  });
  const addWish = () => {
    const t = text.trim().slice(0, RULE_TEXT_MAX);
    if (!t) return;
    void attempt(async () => { await port.put(ruleRecord(ruleId(newId()), { kind: 'wish', text: t, sport: 'all' }, 'active', 'person', now())); setText(''); });
  };
  const pick = (e: Exercise) => { setPicking(false); setChosen(catalog.find((c) => c.id === e.id) ?? e); };
  const exclude = (e: { id: string; title: string }, wholeFamily?: string) => {
    setChosen(null);
    const text = wholeFamily ? `Ohne alle Varianten: ${familyLabel(wholeFamily)}` : `Ohne ${e.title}`;
    void attempt(() => port.put(ruleRecord(ruleId(newId()), { kind: 'exclude', text: text.slice(0, RULE_TEXT_MAX), sport: 'gym', ...(wholeFamily ? { families: [wholeFamily] } : { exerciseIds: [e.id] }) }, 'active', 'person', now())));
  };
  const toggleFocus = (g: (typeof FOCUS_GROUPS)[number]) => {
    const on = goal.focus.includes(g);
    if (!on && goal.focus.length >= MAX_FOCUS) return;
    const focus = on ? goal.focus.filter((x) => x !== g) : [...goal.focus, g];
    const { temporary, ...base } = stored;
    if (goal.temporary && temporary) {
      // An active temporary focus is what is being edited; its end stays as it is.
      void saveGoal({ ...base, temporary: { ...temporary, focus } });
    } else if (weeks > 0) {
      // A time limit lies over the base goal and never changes it.
      void saveGoal({ ...stored, temporary: { focus, until: addDays(today, weeks * 7) } });
    } else {
      void saveGoal({ ...stored, focus });
    }
    if (focus.length >= MAX_FOCUS) setChangingFocus(false);
  };
  const setPrio = (s: SportKey, v: string) => {
    const { temporary, ...base } = stored;
    if (goal.temporary && temporary) {
      const sports = { ...temporary.sports };
      if (v === '') delete sports[s]; else sports[s] = v as Prio;
      const { sports: _old, ...rest } = temporary;
      const hasSports = Object.keys(sports).length > 0;
      void saveGoal({ ...base, ...(rest.focus !== undefined || hasSports ? { temporary: hasSports ? { ...rest, sports } : rest } : {}) });
      return;
    }
    const sports = { ...stored.sports };
    if (v === '') delete sports[s]; else sports[s] = v as Prio;
    void saveGoal({ ...stored, sports });
  };
  // The person picks a new duration for the running temporary focus.
  const pickWeeks = (w: number) => {
    setWeeks(w);
    const { temporary, ...base } = stored;
    if (w > 0 && goal.temporary && temporary) void saveGoal({ ...base, temporary: { ...temporary, until: addDays(today, w * 7) } });
  };
  const endTemporary = () => {
    const { temporary: _t, ...base } = stored;
    void saveGoal(base);
  };

  const shown = (s: SportKey): boolean => used.size === 0 || used.has(s) || goal.sports[s] !== undefined;
  const sportSelect = (s: SportKey) => (
    <label key={s}>{SPORT_LABEL[s]} <select value={goal.sports[s] ?? ''} onChange={(e) => setPrio(s, e.target.value)}>
      <option value="">–</option>
      {(Object.keys(PRIO_LABEL) as Prio[]).map((p) => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
    </select></label>
  );

  return (
    <section className="card tk-rules" aria-label="Meine Regeln und Ziele">
      <h2>Meine Regeln und Ziele</h2>
      <div className="tk-row">
        <label>Ziel <select value={goal.strength} onChange={(e) => void saveGoal({ ...stored, strength: e.target.value as Strength })}>
          {(Object.keys(STRENGTH_LABEL) as Strength[]).map((s) => <option key={s} value={s}>{STRENGTH_LABEL[s]}</option>)}
        </select></label>
      </div>
      {goal.ended && (
        <div className="tk-row">
          <span className="muted">{goal.ended.focus.length ? `Schwerpunkt ${focusLabel(goal.ended.focus)}` : 'Dein befristeter Schwerpunkt'} ist am {dayLabel(goal.ended.until)} ausgelaufen – jetzt wieder dein Grundziel.</span>
          <button type="button" className="ghost tk-small" onClick={() => void attempt(async () => {
            const have = (await port.list('goal')).find((r) => r.id === 'goal');
            const cur = storedGoalOf(have ? [have] : []);
            if (cur.temporary) await port.put(goalRecord({ ...cur, temporary: { ...cur.temporary, endedSeenMs: now() } }, now(), have));
          })}>OK</button>
        </div>
      )}
      <div className="tk-row">
        <span>Schwerpunkt: {goal.focus.length ? focusLabel(goal.focus) : 'keiner'}{goal.temporary?.focus && goal.focus.length ? ` – bis ${dayLabel(goal.temporary.until)}` : ''}</span>
        {goal.temporary && <button type="button" className="ghost tk-small" onClick={endTemporary}>Jetzt beenden</button>}
        <button type="button" className="ghost tk-small" aria-expanded={changingFocus} onClick={() => setChangingFocus(!changingFocus)}>{changingFocus ? 'fertig' : 'ändern'}</button>
      </div>
      {changingFocus && (
        <div className="tk-row">
          <label>für <select aria-label="Dauer" value={weeks} onChange={(e) => pickWeeks(Number(e.target.value))}>
            {WEEK_CHOICES.map((w) => <option key={w} value={w}>{w === 0 ? 'unbefristet' : `${w} Wochen`}</option>)}
          </select></label>
        </div>
      )}
      {changingFocus && (
        <div className="tk-row tk-focus" aria-label={`Schwerpunkt, bis zu ${MAX_FOCUS} Muskeln`}>
          {FOCUS_GROUPS.map((g) => {
            const on = goal.focus.includes(g);
            return <button key={g} type="button" className={on ? 'secondary' : 'ghost'} aria-pressed={on} disabled={!on && goal.focus.length >= MAX_FOCUS} onClick={() => toggleFocus(g)}>{MUSCLE_TARGETS[g].label}</button>;
          })}
        </div>
      )}
      <div className="tk-row">
        {SPORTS.filter(shown).map(sportSelect)}
        {SPORTS.some((s) => !shown(s)) && <button type="button" className="ghost tk-small" aria-expanded={moreSports} onClick={() => setMoreSports(!moreSports)}>Weitere Sportarten</button>}
        {moreSports && SPORTS.filter((s) => !shown(s)).map(sportSelect)}
      </div>
      {rules.length === 0 ? <p className="muted">Noch keine Regeln. Schreib dem Coach „künftig …“ oder füge eine hinzu.</p> : (
        <ul className="tk-rule-list">
          {rules.map((r) => (
            <li key={r.id} className="tk-rule">
              <span className={`tk-rule-text${r.state === 'paused' ? ' muted' : ''}`}>{r.text}{r.kind === 'wish' && <span className="muted"> · Wunsch</span>}{r.state === 'paused' && <span className="muted"> · pausiert</span>}
                {r.kind === 'exclude' && excludedTitles(r, catalog) && <small className="muted"> ({excludedTitles(r, catalog)})</small>}</span>
              <button type="button" className="ghost tk-small" aria-label={`${r.state === 'paused' ? 'Fortsetzen' : 'Pausieren'} ${r.text}`} onClick={() => void move(r.id, r.state === 'paused' ? 'active' : 'paused')}>{r.state === 'paused' ? 'Weiter' : 'Pause'}</button>
              <button type="button" className="ghost tk-small" aria-label={`Löschen ${r.text}`} onClick={() => void remove(r.id)}>Löschen</button>
            </li>
          ))}
        </ul>
      )}
      {tasks.length > 0 && (
        <>
          <h3>Weitergegeben</h3>
          <ul className="tk-rule-list" aria-label="Weitergegeben">
            {tasks.map((t) => (
              <li key={t.id} className="tk-rule">
                <span className="tk-rule-text">An {COACH_LABEL[t.to]}: {t.text}<span className="muted"> · {t.lasting ? 'dauerhaft' : `bis ${shortDate(t.atMs + ONE_OFF_MS)}`}</span></span>
                <button type="button" className="ghost tk-small" aria-label={`Entfernen ${t.text}`} onClick={() => void removeTask(t.id)}>Entfernen</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <form className="tk-row" onSubmit={(e) => { e.preventDefault(); addWish(); }}>
        <input aria-label="Neue Regel" value={text} maxLength={RULE_TEXT_MAX} placeholder="Neue Regel oder Wunsch" onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={!text.trim()}>Regel hinzufügen</button>
        <button type="button" className="ghost" onClick={() => setPicking(true)}>Übung ausschließen</button>
      </form>
      {error && <p role="alert" className="tk-note">{error}</p>}
      {picking && <ExercisePicker port={port} onPick={pick} onClose={() => setPicking(false)} now={now} newId={newId} />}
      {chosen && (
        <div className="tk-row" role="group" aria-label={`${chosen.title} ausschließen`}>
          <button type="button" onClick={() => exclude(chosen)}>Nur diese Übung</button>
          {familyOf(chosen) !== 'other' && <button type="button" onClick={() => exclude(chosen, familyOf(chosen))}>Alle Varianten ({familyLabel(familyOf(chosen))})</button>}
          <button type="button" className="ghost" onClick={() => setChosen(null)}>Abbrechen</button>
        </div>
      )}
    </section>
  );
}

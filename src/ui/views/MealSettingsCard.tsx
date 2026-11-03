import { useEffect, useState } from 'react';
import type { CoachClientMessage } from '../../shared/coach-protocol';
import { DEFAULT_MEAL_SETTINGS, SLOT_LABEL, SLOTS, type Diet, type Habit, type MealSettings } from '../../shared/meals';

const DIET_LABEL: Record<Diet, string> = { vegetarisch: 'Vegetarisch', vegan: 'Vegan', alles: 'Alles' };
const HABIT_LABEL: Record<Habit, string> = { zuhause: 'zu Hause', mitnehmen: 'zum Mitnehmen', auswaerts: 'auswärts, nicht im Plan' };

const Tags = ({ label, placeholder, tags, onChange }: { label: string; placeholder: string; tags: string[]; onChange: (t: string[]) => void }) => {
  const [text, setText] = useState('');
  const add = () => { const t = text.trim(); if (t && !tags.includes(t)) onChange([...tags, t]); setText(''); };
  return (
    <div className="meal-tags">
      <span className="meal-tags-label">{label}</span>
      <div className="row">
        {tags.map((t) => (
          <span key={t} className="meal-tag">{t}<button type="button" aria-label={`${t} entfernen`} onClick={() => onChange(tags.filter((x) => x !== t))}>×</button></span>
        ))}
        <input aria-label={label} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="secondary" disabled={!text.trim()} onClick={add}>Hinzufügen</button>
      </div>
    </div>
  );
};

/** The profile's part of the household meal plan. Off by default; every change is saved at once. */
export const MealSettingsCard = ({ profileId, settings, coachConnected, send }: { profileId: string; settings: MealSettings | undefined; coachConnected: boolean; send: (m: CoachClientMessage) => void }) => {
  const [s, setS] = useState<MealSettings>(settings ?? DEFAULT_MEAL_SETTINGS);
  useEffect(() => { if (settings) setS(settings); }, [JSON.stringify(settings)]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (next: MealSettings) => { setS(next); send({ type: 'meals-settings', profileId, settings: next }); };
  return (
    <section className="card meal-settings" aria-label="Essensplan">
      <h3>Essensplan</h3>
      <div className="row">
        <button type="button" className={s.on ? '' : 'secondary'} aria-pressed={s.on} disabled={!coachConnected} onClick={() => save({ ...s, on: !s.on })}>Essensplan: {s.on ? 'an' : 'aus'}</button>
      </div>
      <p className="muted">Ein Wochenplan für Frühstück, Mittagessen zum Mitnehmen und ein kleines Abendessen, mit Einkaufsliste. Samstags plant Pandafit die kommende Woche, für alle auf diesem Mac, die ihn eingeschaltet haben.</p>
      {s.on && (
        <div className="meal-settings-form">
          <label>Ernährungsform
            <select value={s.diet} onChange={(e) => save({ ...s, diet: e.target.value as Diet })}>
              {(Object.keys(DIET_LABEL) as Diet[]).map((d) => <option key={d} value={d}>{DIET_LABEL[d]}</option>)}
            </select>
          </label>
          <Tags label="Abneigungen" placeholder="zum Beispiel Pilze" tags={s.dislikes} onChange={(dislikes) => save({ ...s, dislikes })} />
          <Tags label="Unverträglichkeiten" placeholder="zum Beispiel Laktose" tags={s.intolerances} onChange={(intolerances) => save({ ...s, intolerances })} />
          <div className="form-row">
            {SLOTS.map((slot) => (
              <label key={slot}>{SLOT_LABEL[slot]} an Werktagen
                <select value={s.habits[slot]} onChange={(e) => save({ ...s, habits: { ...s.habits, [slot]: e.target.value as Habit } })}>
                  {(Object.keys(HABIT_LABEL) as Habit[]).map((h) => <option key={h} value={h}>{HABIT_LABEL[h]}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="muted">Der Coach meidet, was hier steht. Bei Unverträglichkeiten die Zutaten bitte trotzdem selbst prüfen.</p>
        </div>
      )}
    </section>
  );
};

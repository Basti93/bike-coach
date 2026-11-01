import { useState } from 'react';
import type { CoachClientMessage } from '../../shared/coach-protocol';
import { reviewFields, type GarminSuggestion, type ReviewKey } from '../../shared/garmin-profile';
import type { Profile } from '../../shared/profiles';
import type { ClientMessage } from '../../shared/protocol';

const SEX_TEXT: Record<string, string> = { male: 'Mann', female: 'Frau' };
const later = (id: string) => `bike-coach:garmin-review-later:${id}`;
const shown = (value: string | null): string => (value === null ? 'leer' : SEX_TEXT[value] ?? value);

const markOf = (profile: Profile, ftpW: number, suggestion: GarminSuggestion): string =>
  JSON.stringify(reviewFields(profile, ftpW, suggestion).map((f) => [f.key, f.garmin]));

/** Weist auf neue oder abweichende Werte hin. „Später“ gilt, bis Garmin etwas anderes liefert. */
export const GarminProfileBanner = ({ profile, ftpW, suggestion, onReview }: { profile: Profile; ftpW: number; suggestion: GarminSuggestion | null | undefined; onReview: () => void }) => {
  const [, refresh] = useState(0);
  if (!suggestion) return null;
  const fields = reviewFields(profile, ftpW, suggestion);
  if (!fields.length) return null;
  const mark = markOf(profile, ftpW, suggestion);
  let dismissed: string | null = null;
  try { dismissed = localStorage.getItem(later(profile.id)); } catch { /* dann eben wieder anzeigen */ }
  if (dismissed === mark) return null;
  return (
    <p className="notice row">
      <span>Garmin hat Werte für dein Profil.</span>
      <button className="secondary" onClick={onReview}>Werte aus Garmin prüfen</button>
      <button className="ghost" onClick={() => { try { localStorage.setItem(later(profile.id), mark); } catch { /* gilt dann nur jetzt */ } refresh((n) => n + 1); }}>Später</button>
    </p>
  );
};

type Props = {
  profile: Profile; ftpW: number; suggestion: GarminSuggestion;
  sendRide: (m: ClientMessage) => void; sendCoach: (m: CoachClientMessage) => void; onBack: () => void;
};

/** Nichts wird ohne „Übernehmen“ gespeichert, jeder Wert zeigt seine Herkunft und bleibt änderbar. */
export const GarminProfileReview = ({ profile, ftpW, suggestion, sendRide, sendCoach, onBack }: Props) => {
  const fields = reviewFields(profile, ftpW, suggestion);
  const [selected, setSelected] = useState<Partial<Record<ReviewKey, boolean>>>(() => Object.fromEntries(fields.map((f) => [f.key, f.selected])));
  const [values, setValues] = useState<Partial<Record<ReviewKey, string>>>(() => Object.fromEntries(fields.map((f) => [f.key, f.garmin])));
  const number = (key: ReviewKey): number => Number((values[key] ?? '').trim().replace(',', '.'));

  const inRange = (key: ReviewKey, min: number, max: number): boolean => number(key) >= min && number(key) <= max;
  const invalid = fields.filter((f) => selected[f.key] && !({
    birthDate: /^\d{4}-\d{2}-\d{2}$/.test(values.birthDate ?? '') && !Number.isNaN(Date.parse(values.birthDate ?? '')),
    sex: true,
    heightCm: inRange('heightCm', 120, 230),
    weightKg: inRange('weightKg', 30, 250),
    ftpW: inRange('ftpW', 50, 1000),
    hrMaxBpm: inRange('hrMaxBpm', 100, 240),
  })[f.key]).map((f) => f.label);

  const take = () => {
    // Erst alles prüfen: Sonst stünde die FTP schon im Coach, während das Profil abgelehnt wird.
    if (invalid.length) return;
    const next: Profile = { ...profile };
    for (const f of fields) {
      if (!selected[f.key]) continue;
      if (f.key === 'birthDate') next.birthDate = values.birthDate;
      else if (f.key === 'sex') next.sex = values.sex as Profile['sex'];
      else if (f.key === 'ftpW') {
        next.ftpW = number('ftpW');
        delete next.ftpCapW;
        if (suggestion.ftp?.capW) next.ftpCapW = suggestion.ftp.capW;
        sendCoach({ type: 'set-ftp', profileId: profile.id, ftpW: next.ftpW });
      } else next[f.key] = number(f.key);
    }
    // Was nach dem Prüfen noch abweicht, hast du bewusst behalten: Erst neue Garmin-Werte melden sich wieder.
    try { localStorage.setItem(later(profile.id), markOf(next, selected.ftpW ? next.ftpW : ftpW, suggestion)); } catch { /* gilt dann nur jetzt */ }
    sendRide({ type: 'save-profile', profile: next });
    onBack();
  };

  return (
    <main>
      <div className="top"><h1>Werte aus Garmin</h1></div>
      <section className="card form">
        <p className="muted">Wähle, was du übernehmen willst. Was du nicht wählst, bleibt, wie es ist.</p>
        {fields.map((f) => (
          <div key={f.key} className="review-row">
            <input type="checkbox" aria-label={`${f.label} übernehmen`} checked={!!selected[f.key]} onChange={(e) => setSelected({ ...selected, [f.key]: e.target.checked })} />
            <label>{f.label}
              <input value={f.key === 'sex' ? shown(values.sex ?? null) : values[f.key] ?? ''} disabled={f.key === 'sex'} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            </label>
            <span className="muted">{f.origin}: {shown(f.garmin)}, bei dir: {shown(f.own)}</span>
          </div>
        ))}
        {selected.ftpW && suggestion.ftp?.source === 'rides' && <p className="notice" role="status">Aus deiner stärksten längeren Fahrt des letzten Jahres. Deine echte FTP kann höher liegen, ein Rampentest zeigt es genauer.</p>}
        {selected.ftpW && suggestion.ftp?.source === 'estimate' && <p className="notice" role="status">Das ist eine vorsichtige Schätzung, weil Garmins FTP fehlt oder veraltet ist.</p>}
        {suggestion.missing.length > 0 && <p className="muted">Garmin liefert nicht: {suggestion.missing.join(', ')}. Das kannst du unter „Profil bearbeiten“ eintragen.</p>}
        {invalid.length > 0 && <p className="notice" role="alert">Bitte prüfen: {invalid.join(', ')}.</p>}
        <p className="muted">Der Maximalpuls ist dein höchster gemessener Wert. Uhren messen dabei manchmal zu hoch, und die Pulszonen hängen daran. Das ist keine medizinische Grenze.</p>
        <div className="row">
          <button onClick={take} disabled={invalid.length > 0}>Übernehmen</button>
          <button className="secondary" onClick={onBack}>Abbrechen</button>
        </div>
      </section>
    </main>
  );
};

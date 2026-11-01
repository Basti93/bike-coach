import { useState } from 'react';
import type { CoachClientMessage } from '../../shared/coach-protocol';
import type { ClientMessage } from '../../shared/protocol';
import type { Profile } from '../../shared/profiles';

const number = (text: string): number => Number(text.trim().replace(',', '.'));
const outside = (text: string, min: number, max: number): boolean => text.trim() !== '' && !(number(text) >= min && number(text) <= max);
const ageOf = (birthDate: string): number => (Date.now() - Date.parse(birthDate)) / (365.25 * 86_400_000);
const text = (n: number | undefined): string => (n === undefined ? '' : String(n));

type Props = {
  profile: Profile; ftpW: number; coachConnected: boolean;
  sendRide: (m: ClientMessage) => void; sendCoach: (m: CoachClientMessage) => void; onBack: () => void;
};

/** Hier gilt, was du einträgst: Garmin überschreibt diese Werte nie von selbst. */
export const ProfileSettingsView = ({ profile, ftpW, coachConnected, sendRide, sendCoach, onBack }: Props) => {
  const [name, setName] = useState(profile.name);
  const [ftp, setFtp] = useState(String(ftpW));
  const [maxHr, setMaxHr] = useState(text(profile.maxHrBpm));
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? '');
  const [sex, setSex] = useState(profile.sex ?? 'unknown');
  const [height, setHeight] = useState(text(profile.heightCm));
  const [weight, setWeight] = useState(text(profile.weightKg));

  const invalid = [
    name.trim() === '' && 'Name',
    !(number(ftp) >= 50) && 'FTP (ab 50 W)',
    outside(maxHr, 80, 240) && 'Pulsgrenze (80 bis 240)',
    birthDate !== '' && !(ageOf(birthDate) >= 14 && ageOf(birthDate) <= 100) && 'Geburtsdatum (ab 14 Jahren)',
    outside(height, 120, 230) && 'Größe (120 bis 230 cm)',
    outside(weight, 30, 250) && 'Gewicht (30 bis 250 kg)',
  ].filter((x): x is string => typeof x === 'string');
  const ftpChanged = number(ftp) !== ftpW;

  const save = () => {
    if (invalid.length) return;
    // Bewusst aus Bestehendem aufgebaut: Unbekannte Felder und die ID bleiben erhalten.
    const next: Profile = { ...profile, name: name.trim(), sex };
    for (const key of ['maxHrBpm', 'birthDate', 'heightCm', 'weightKg'] as const) delete next[key];
    if (maxHr.trim()) next.maxHrBpm = number(maxHr);
    if (birthDate) next.birthDate = birthDate;
    if (height.trim()) next.heightCm = number(height);
    if (weight.trim()) next.weightKg = number(weight);
    if (ftpChanged) {
      next.ftpW = number(ftp);
      // Die Obergrenze gilt nur für die Schätzung und würde einen gemessenen Wert sonst später drücken.
      delete next.ftpCapW;
      sendCoach({ type: 'set-ftp', profileId: profile.id, ftpW: number(ftp) });
    }
    sendRide({ type: 'save-profile', profile: next });
    onBack();
  };

  return (
    <main>
      <div className="top"><h1>Dein Profil</h1></div>
      <form className="card form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Geburtsdatum<input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></label>
        <label>Geschlecht
          <select value={sex} onChange={(e) => setSex(e.target.value as typeof sex)}>
            <option value="unknown">Keine Angabe</option>
            <option value="female">Frau</option>
            <option value="male">Mann</option>
          </select>
        </label>
        <div className="form-row">
          <label>Größe (cm)<input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
          <label>Gewicht (kg)<input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
        </div>
        <div className="form-row">
          <label>FTP in Watt<input inputMode="numeric" disabled={!coachConnected} value={ftp} onChange={(e) => setFtp(e.target.value)} /></label>
          <label>Pulsgrenze<input inputMode="numeric" value={maxHr} onChange={(e) => setMaxHr(e.target.value)} /></label>
        </div>
        {ftpChanged && !invalid.length && <p className="notice" role="status">Mit der neuen FTP plant der Coach deine nächste Einheit neu.</p>}
        {invalid.length > 0 && <p className="notice" role="alert">Bitte prüfen: {invalid.join(', ')}.</p>}
        <p className="muted">Bei Beschwerden wie Brustschmerz oder Schwindel, oder bei bekannter Herz-Kreislauf-Erkrankung vor dem Training ärztlich abklären.</p>
        <div className="row">
          <button type="submit" disabled={invalid.length > 0}>Speichern</button>
          <button type="button" className="secondary" onClick={onBack}>Abbrechen</button>
        </div>
      </form>
    </main>
  );
};

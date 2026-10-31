import { useState } from 'react';
import type { Profile } from '../../shared/profiles';

export const ProfileView = ({ profiles, onPick, onAdd }: { profiles: Profile[]; onPick: (p: Profile) => void; onAdd: (p: Profile) => void }) => {
  const [name, setName] = useState('');
  const [ftp, setFtp] = useState('150');
  const [maxHr, setMaxHr] = useState('');
  const add = () => {
    onAdd({ id: crypto.randomUUID(), name: name.trim(), ftpW: Number(ftp), ...(Number(maxHr) > 0 ? { maxHrBpm: Number(maxHr) } : {}) });
    setName('');
  };
  return (
    <main>
      <h1>Wer fährt?</h1>
      <div className="row">{profiles.map((p) => <button key={p.id} onClick={() => onPick(p)}>{p.name} ({p.ftpW} W)</button>)}</div>
      <h3>Neues Profil</h3>
      <div className="row">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="FTP in Watt" type="number" min="50" value={ftp} onChange={(e) => setFtp(e.target.value)} />
        <input aria-label="Pulsgrenze (optional)" placeholder="Pulsgrenze (optional)" type="number" min="80" value={maxHr} onChange={(e) => setMaxHr(e.target.value)} />
        <button disabled={!name.trim() || Number(ftp) < 50} onClick={add}>Anlegen</button>
      </div>
    </main>
  );
};

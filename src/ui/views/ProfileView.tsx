import { useState } from 'react';
import type { Profile } from '../../shared/profiles';

export const ProfileView = ({ profiles, onPick, onAdd }: { profiles: Profile[]; onPick: (p: Profile) => void; onAdd: (p: Profile) => void }) => {
  const [name, setName] = useState('');
  const [ftp, setFtp] = useState('150');
  const [maxHr, setMaxHr] = useState('');
  const [adding, setAdding] = useState(false);
  const add = () => {
    onAdd({ id: crypto.randomUUID(), name: name.trim(), ftpW: Number(ftp), ...(Number(maxHr) > 0 ? { maxHrBpm: Number(maxHr) } : {}) });
    setName('');
    setAdding(false);
  };
  const showForm = adding || profiles.length === 0;
  return (
    <main className="center">
      <h1>{profiles.length ? 'Wer fährt?' : 'Willkommen'}</h1>
      {profiles.length > 0 && (
        <div className="choices">
          {profiles.map((p) => <button key={p.id} className="choice" onClick={() => onPick(p)}>{p.name}</button>)}
        </div>
      )}
      {showForm ? (
        <form className="card form" onSubmit={(e) => { e.preventDefault(); if (name.trim() && Number(ftp) >= 50) add(); }}>
          <label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>FTP-Schätzung in Watt<input type="number" min="50" value={ftp} onChange={(e) => setFtp(e.target.value)} /></label>
          <label>Pulsgrenze (optional)<input type="number" min="80" value={maxHr} onChange={(e) => setMaxHr(e.target.value)} /></label>
          <p className="muted">Die FTP muss nicht stimmen, der erste Rampentest ermittelt sie.</p>
          <button type="submit" disabled={!name.trim() || Number(ftp) < 50}>Profil anlegen</button>
        </form>
      ) : <button className="ghost" onClick={() => setAdding(true)}>Neues Profil</button>}
    </main>
  );
};

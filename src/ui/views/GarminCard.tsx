import { useState } from 'react';
import type { CoachClientMessage, GarminStatus, GarminSyncInfo } from '../../shared/coach-protocol';

const REASON: Record<string, string> = {
  credentials: 'Die Anmeldung wurde abgelehnt. Bitte E-Mail und Passwort prüfen.',
  'rate-limit': 'Garmin blockt gerade zu viele Anmeldeversuche. Bitte erst später erneut versuchen, frühes Wiederholen kann die Sperre verlängern.',
  setup: 'Das Garmin-Hilfsprogramm fehlt auf diesem Mac.',
  failed: 'Die Verbindung hat nicht geklappt. Bitte später erneut versuchen.',
};

const syncText = (sync: GarminSyncInfo): string => {
  const parts: string[] = [];
  if (sync.running) parts.push('Daten werden gerade geholt');
  else if (sync.lastRunMs) {
    const at = new Date(sync.lastRunMs);
    parts.push(`Zuletzt aktualisiert: ${at.toLocaleDateString('de-DE')} ${at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`);
  }
  if (!sync.complete && sync.problem === null) parts.push('Verlauf wird noch geladen');
  if (sync.problem === 'rate-limit') parts.push('Abruf pausiert: Garmin blockt gerade, es geht später von selbst weiter');
  if (sync.problem === 'failed') parts.push('Abruf gerade nicht möglich, es geht später von selbst weiter');
  return parts.join(' · ');
};

/** Verbindet ein Profil mit Garmin Connect. Das Passwort bleibt nur bis zum Absenden im Formular. */
export const GarminCard = ({ profileId, status, sync, send }: { profileId: string; status: GarminStatus; sync?: GarminSyncInfo | null; send: (m: CoachClientMessage) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const reauth = sync?.problem === 'reauth';
  if (status.state === 'connected' && !reauth) {
    return (
      <section className="card garmin">
        <span className="dot on">Garmin verbunden</span>
        {sync && <span className="muted" role="status">{syncText(sync)}</span>}
        <button className="ghost" onClick={() => send({ type: 'garmin-disconnect', profileId })}>Trennen</button>
      </section>
    );
  }
  if (status.state === 'connecting') return <section className="card garmin" role="status">Garmin wird verbunden…</section>;
  if (status.state === 'needs-mfa') {
    return (
      <form className="card form garmin-form" onSubmit={(e) => { e.preventDefault(); if (!code.trim()) return; send({ type: 'garmin-mfa', profileId, code: code.trim() }); setCode(''); }}>
        <label>Zwei-Faktor-Code<input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button type="submit">Code senden</button>
      </form>
    );
  }
  return (
    <form className="card form garmin-form" onSubmit={(e) => {
      e.preventDefault();
      if (!email.trim() || !password) return;
      send({ type: 'garmin-login', profileId, email: email.trim(), password });
      setPassword('');
    }}>
      <h3>Garmin verbinden</h3>
      {reauth && <p className="notice" role="alert">Die Garmin-Anmeldung ist abgelaufen. Bitte erneut anmelden.</p>}
      {status.state === 'failed' && <p className="notice" role="alert">{REASON[status.reason]}</p>}
      <label>E-Mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Passwort<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button type="submit">Mit Garmin verbinden</button>
      <p className="muted">Inoffizieller Zugang, den Garmin jederzeit ändern kann. Das Passwort wird nicht gespeichert, nur ein Zugangstoken auf diesem Mac.</p>
    </form>
  );
};

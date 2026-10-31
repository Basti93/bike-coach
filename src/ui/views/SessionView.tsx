import type { Profile } from '../../shared/profiles';
import type { ClientMessage } from '../../shared/protocol';
import { STARTER_SESSIONS } from '../../shared/starter-sessions';

export const SessionView = ({ profile, send, onBack }: { profile: Profile; send: (m: ClientMessage) => void; onBack: () => void }) => (
  <main>
    <h1>Hallo {profile.name}, was fährst du heute?</h1>
    <div className="row">
      {STARTER_SESSIONS.map((s) => (
        <button key={s.id} onClick={() => send({ type: 'start', profileId: profile.id, session: s, ftpW: profile.ftpW })}>{s.name}</button>
      ))}
    </div>
    <p><button className="secondary" onClick={onBack}>Profil wechseln</button></p>
  </main>
);

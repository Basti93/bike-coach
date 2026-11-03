import type { ReactNode } from 'react';
import type { GarminUploadSettings } from '../../coach/garmin-upload';
import type { AccountStatus, CoachClientMessage, CoachHome, GarminStatus, GarminSyncInfo, HevyStatus } from '../../shared/coach-protocol';
import { AccountCard } from './AccountCard';
import { GarminCard } from './GarminCard';
import { HevyCard } from './HevyCard';

const NO_ACCOUNT: AccountStatus = { state: 'idle', name: null, reason: null, refused: 0, offline: false, lastSyncMs: null };

type Props = {
  profileId: string; coachConnected: boolean; send: (m: CoachClientMessage) => void;
  garmin: GarminStatus; garminSync?: GarminSyncInfo | null; upload?: GarminUploadSettings;
  hevy?: HevyStatus; account?: AccountStatus; coachHome?: CoachHome;
  /** The language toggle and anything else that only concerns this profile. */
  settings?: ReactNode;
  /** A calm line under the settings, for example what "Krafttraining starten" does. */
  settingsNote?: string;
  /** The meal plan section, between the settings and the connections. */
  meals?: ReactNode;
};

/** The profile page's own sections: small settings, then every connection, each optional and shown whether connected or not. */
export const ProfileExtras = ({ profileId, coachConnected, send, garmin, garminSync, upload, hevy, account, coachHome, settings, settingsNote, meals }: Props) => (
  <>
    {settings && (
      <section className="card profile-settings">
        <h3>Einstellungen</h3>
        <div className="row">{settings}</div>
        {settingsNote && <p className="muted">{settingsNote}</p>}
      </section>
    )}
    {meals}
    <section className="connections" aria-label="Verbindungen">
      <h2>Verbindungen</h2>
      <p className="muted">Alles hier ist freiwillig. Pandafit läuft auch ganz ohne, und du kannst jederzeit verbinden oder trennen.</p>
      {!coachConnected ? <p className="notice" role="status">Der Coach ist gerade nicht erreichbar. Sobald er wieder da ist, kannst du hier verbinden.</p> : (
        <>
          {garmin.state === 'idle'
            ? <details className="card garmin-later"><summary>Garmin verbinden (optional)</summary><GarminCard profileId={profileId} status={garmin} sync={garminSync} send={send} upload={upload} /></details>
            : <GarminCard profileId={profileId} status={garmin} sync={garminSync} send={send} upload={upload} />}
          <HevyCard profileId={profileId} status={hevy ?? { state: 'idle' }} send={send} />
          <AccountCard profileId={profileId} status={account ?? NO_ACCOUNT} send={send} coachHome={coachHome} />
        </>
      )}
    </section>
  </>
);

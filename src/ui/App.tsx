import { useState } from 'react';
import type { Profile } from '../shared/profiles';
import { useRide } from './useRide';
import { FilmView } from './views/FilmView';
import { ProfileView } from './views/ProfileView';
import { RecoveryDialog } from './views/RecoveryDialog';
import { RideView } from './views/RideView';
import { SessionView } from './views/SessionView';

export const App = () => {
  const { state, offer, clearOffer, connected, send } = useRide();
  const [profile, setProfile] = useState<Profile | null>(null);
  if (window.location.hash === '#film') return <FilmView state={state} send={send} />;
  if (!connected) return <main>Fahrdienst startet…</main>;
  const dialog = offer && (
    <RecoveryDialog
      offer={offer}
      profileName={state?.profiles.find((p) => p.id === offer.profileId)?.name ?? 'Unbekanntes Profil'}
      send={send}
      onClose={clearOffer}
    />
  );
  if (state?.engine) return <>{dialog}<RideView state={state} send={send} /></>;
  return profile
    ? <SessionView profile={profile} send={send} onBack={() => setProfile(null)} />
    : <ProfileView profiles={state?.profiles ?? []} onPick={setProfile} onAdd={(p) => send({ type: 'save-profile', profile: p })} />;
};

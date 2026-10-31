import { useState } from 'react';
import type { Profile } from '../shared/profiles';
import { useCoach } from './useCoach';
import { useRide } from './useRide';
import { FilmView } from './views/FilmView';
import { ProfileView } from './views/ProfileView';
import { RecoveryDialog } from './views/RecoveryDialog';
import { RideView } from './views/RideView';
import { CoachView } from './views/CoachView';
import { FeedbackView } from './views/FeedbackView';

export const App = () => {
  const { state, offer, clearOffer, connected, send, error } = useRide();
  const [profile, setProfile] = useState<Profile | null>(null);
  const coach = useCoach(profile?.id ?? null);
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
  const notice = error && <div role="alert">{error}</div>;
  if (state?.engine) return <>{notice}{dialog}<RideView state={state} send={send} /></>;
  return (
    <>
      {notice}
      {profile
        ? (
          <>
            {coach.state?.awaitingFeedback && <FeedbackView profileId={profile.id} rideId={coach.state.awaitingFeedback} send={coach.send} />}
            <CoachView profile={profile} state={coach.state} thinking={coach.thinking} coachConnected={coach.connected} sendRide={send} sendCoach={coach.send} onBack={() => setProfile(null)} />
          </>
        )
        : <ProfileView profiles={state?.profiles ?? []} onPick={setProfile} onAdd={(p) => send({ type: 'save-profile', profile: p })} />}
    </>
  );
};

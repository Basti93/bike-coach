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
import { WordCard } from './views/WordCard';

const CALM_FRACTION = 0.75;
const CALM_GRADE = 3;

export const App = () => {
  const { click, state, offer, clearOffer, connected, send, error } = useRide();
  const [profile, setProfile] = useState<Profile | null>(null);
  const coach = useCoach(profile?.id ?? state?.ride?.profileId ?? null);
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
  if (state?.engine) {
    // Sprache nur in ruhigen Phasen, nie in harten Abschnitten oder über der eigenen Pulsgrenze.
    const c = coach.state;
    const maxHr = state.profiles.find((p) => p.id === state.ride?.profileId)?.maxHrBpm;
    const calm = c !== null && !state.engine.paused
      && (state.engine.gradePct !== null ? state.engine.gradePct <= CALM_GRADE : (state.engine.targetW ?? Infinity) <= c.ftpW * CALM_FRACTION)
      && !(maxHr && (state.latest.hrBpm ?? 0) >= maxHr);
    return <>{notice}{dialog}<RideView state={state} send={send} extra={calm && c ? <WordCard state={c} send={coach.send} click={state.engine.gradePct === null ? click : null} /> : null} /></>;
  }
  return (
    <>
      {notice}
      {profile
        ? (coach.state?.awaitingFeedback
          ? <FeedbackView together={coach.together} profileId={profile.id} rideId={coach.state.awaitingFeedback} send={coach.send} />
          : <CoachView together={coach.together} profile={profile} state={coach.state} thinking={coach.thinking} coachConnected={coach.connected} sendRide={send} sendCoach={coach.send} onBack={() => setProfile(null)} />)
        : <ProfileView profiles={state?.profiles ?? []} onPick={setProfile} onAdd={(p) => send({ type: 'save-profile', profile: p })} />}
    </>
  );
};

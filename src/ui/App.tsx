import { useState } from 'react';
import type { Profile } from '../shared/profiles';
import { useCoach } from './useCoach';
import { useLanguageLearning } from './useLanguageLearning';
import { useRide } from './useRide';
import { FilmView } from './views/FilmView';
import { ProfileView } from './views/ProfileView';
import { RecoveryDialog } from './views/RecoveryDialog';
import { HealthView, type HealthRange } from './views/HealthView';
import { GarminProfileReview } from './views/GarminProfileReview';
import { ProfileSettingsView } from './views/ProfileSettingsView';
import { RideView } from './views/RideView';
import { StatusBar } from './views/StatusBar';
import { CoachView } from './views/CoachView';
import { FeedbackView } from './views/FeedbackView';
import { HistoryView } from './views/HistoryView';
import { TogetherView } from './views/TogetherView';
import { WordCard } from './views/WordCard';

const CALM_FRACTION = 0.75;
const CALM_GRADE = 3;

export const App = () => {
  const ride = useRide();
  return (
    <div className="shell">
      <StatusBar state={ride.state} connected={ride.connected} send={ride.send} />
      <div className="page"><Page ride={ride} /></div>
    </div>
  );
};

const Page = ({ ride }: { ride: ReturnType<typeof useRide> }) => {
  const { click, state, offer, clearOffer, connected, send, error } = ride;
  const [picked, setProfile] = useState<Profile | null>(null);
  // Immer der gespeicherte Stand, sonst gingen Änderungen beim nächsten Speichern oder Start verloren.
  const profile = state?.profiles.find((p) => p.id === picked?.id) ?? picked;
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [health, setHealth] = useState<HealthRange | undefined>(undefined);
  const [history, setHistory] = useState(false);
  const [overview, setOverview] = useState(false);
  const coach = useCoach(profile?.id ?? state?.ride?.profileId ?? state?.profiles[0]?.id ?? null);
  const language = useLanguageLearning(state?.ride?.profileId ?? profile?.id ?? null);
  const languageToggle = <button className="secondary" onClick={language.toggle}>Sprachen lernen: {language.enabled ? 'an' : 'aus'}</button>;
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
    return <>{notice}{dialog}<RideView state={state} send={send} tools={languageToggle} extra={c && language.enabled ? <WordCard calm={calm} state={c} send={coach.send} click={state.engine.gradePct === null ? click : null} /> : null} /></>;
  }
  if (editing && profile) return <>{notice}<ProfileSettingsView profile={profile} ftpW={coach.state?.ftpW ?? profile.ftpW} coachConnected={coach.connected && coach.state !== null} sendRide={send} sendCoach={coach.send} onBack={() => setEditing(false)} /></>;
  const showHealth = (range: HealthRange): void => {
    setHealth(range);
    if (profile) coach.send({ type: 'garmin-health', profileId: profile.id, rangeDays: range });
  };
  if (health !== undefined) return <>{notice}<HealthView data={coach.garminHealth} range={health} onRange={showHealth} readiness={coach.garminReadiness} sync={coach.garminSync} onBack={() => setHealth(undefined)} /></>;
  if (reviewing && profile && coach.garminSuggestion) return <>{notice}<GarminProfileReview profile={profile} ftpW={coach.state?.ftpW ?? profile.ftpW} suggestion={coach.garminSuggestion} sendRide={send} sendCoach={coach.send} onBack={() => setReviewing(false)} /></>;
  if (overview && coach.together) return <>{notice}<TogetherView together={coach.together} onBack={() => setOverview(false)} /></>;
  return (
    <>
      {notice}
      {profile
        ? (history && coach.state ? <HistoryView state={coach.state} detail={coach.detail} send={coach.send} onBack={() => setHistory(false)} /> : coach.state?.awaitingFeedback
          ? <FeedbackView together={coach.together} profileId={profile.id} rideId={coach.state.awaitingFeedback} send={coach.send} />
          : <CoachView onHealth={() => showHealth(28)} garminSuggestion={coach.garminSuggestion} onReviewGarmin={() => setReviewing(true)} onEdit={() => setEditing(true)} garmin={coach.garmin} garminSync={coach.garminSync} garminReadiness={coach.garminReadiness} tools={languageToggle} onTogether={() => setOverview(true)} onHistory={() => setHistory(true)} together={coach.together} profile={profile} state={coach.state} thinking={coach.thinking} coachConnected={coach.connected} sendRide={send} sendCoach={coach.send} onBack={() => setProfile(null)} />)
        : <ProfileView onTogether={coach.together ? () => setOverview(true) : undefined} profiles={state?.profiles ?? []} onPick={setProfile} onAdd={(p) => send({ type: 'save-profile', profile: p })} />}
    </>
  );
};
